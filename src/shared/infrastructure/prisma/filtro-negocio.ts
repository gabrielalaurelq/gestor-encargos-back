import { Prisma } from '@prisma/client';

// Doc 4, Bloque 5 / Doc 8, Bloque 1 y 2: Prisma Client Extension que inyecta
// `negocioId` en toda consulta y escritura de los modelos multitenant, para
// que ningún caso de uso pueda "olvidarse" de filtrar por negocio. Es la capa
// de aplicación; la red final es RLS en Postgres (Doc 4 Bloque 4).
//
// Límite conocido: los hooks de `$allModels` ven solo la operación de primer
// nivel, no los `create` anidados (ej. Encargo con `objetos: { create: [...] }`).
// Esos hijos deben llevar `negocioId` explícito en el mapper del repositorio;
// si falta, NOT NULL lo rechaza, y si es de otro negocio, RLS lo rechaza.

export const CAMPO_NEGOCIO = 'negocioId';

/** Modelos con columna `negocio_id`, derivados del schema (no una lista a mano). */
export const MODELOS_CON_NEGOCIO: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((modelo) => modelo.fields.some((campo) => campo.name === CAMPO_NEGOCIO))
    .map((modelo) => modelo.name),
);

const OPERACIONES_CON_WHERE = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

const OPERACIONES_CON_DATA_UNICA = new Set(['create', 'update', 'updateMany']);
const OPERACIONES_CON_DATA_MULTIPLE = new Set(['createMany', 'createManyAndReturn']);

type Args = Record<string, unknown>;

export class NegocioAjenoError extends Error {
  constructor(modelo: string, operacion: string) {
    super(
      `${modelo}.${operacion} recibió un negocioId distinto al de la sesión autenticada — ` +
        'los casos de uso no deben pasar negocioId a mano (Doc 8, Bloque 1).',
    );
    this.name = 'NegocioAjenoError';
  }
}

function conNegocio(objeto: unknown, negocioId: string, modelo: string, operacion: string): Args {
  const base = (objeto ?? {}) as Args;
  const actual = base[CAMPO_NEGOCIO];
  if (actual !== undefined && actual !== negocioId) {
    throw new NegocioAjenoError(modelo, operacion);
  }
  return { ...base, [CAMPO_NEGOCIO]: negocioId };
}

/**
 * Devuelve los `args` de una operación de Prisma con `negocioId` inyectado
 * donde corresponde. Función pura, testeable sin base de datos.
 */
export function inyectarNegocio(
  modelo: string,
  operacion: string,
  args: Args | undefined,
  negocioId: string,
): Args {
  if (!MODELOS_CON_NEGOCIO.has(modelo)) return args ?? {};
  const resultado: Args = { ...(args ?? {}) };

  if (OPERACIONES_CON_WHERE.has(operacion)) {
    // Los campos de primer nivel del `where` se combinan con AND, así que
    // agregar negocioId restringe cualquier filtro previo (incluidos OR/AND).
    // Prisma 5 admite campos no únicos extra en el where de findUnique/update/
    // delete ("extendedWhereUnique").
    resultado.where = conNegocio(resultado.where, negocioId, modelo, operacion);
  }

  if (OPERACIONES_CON_DATA_UNICA.has(operacion) && operacion !== 'create') {
    // update/updateMany: no se inyecta (no hay que "mover" filas), pero sí se
    // impide reasignar una fila a otro negocio.
    const data = (resultado.data ?? {}) as Args;
    if (data[CAMPO_NEGOCIO] !== undefined && data[CAMPO_NEGOCIO] !== negocioId) {
      throw new NegocioAjenoError(modelo, operacion);
    }
  }

  if (operacion === 'create') {
    resultado.data = conNegocio(resultado.data, negocioId, modelo, operacion);
  }

  if (operacion === 'upsert') {
    resultado.create = conNegocio(resultado.create, negocioId, modelo, operacion);
  }

  if (OPERACIONES_CON_DATA_MULTIPLE.has(operacion)) {
    const data = resultado.data;
    resultado.data = Array.isArray(data)
      ? data.map((fila) => conNegocio(fila, negocioId, modelo, operacion))
      : conNegocio(data, negocioId, modelo, operacion);
  }

  return resultado;
}

export function extensionFiltroNegocio(negocioId: string) {
  return Prisma.defineExtension({
    name: `filtroNegocio(${negocioId})`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(inyectarNegocio(model, operation, args as Args, negocioId) as typeof args);
        },
      },
    },
  });
}
