import { ConflictException } from '@nestjs/common';
import { RecursoDuplicadoError } from '../domain/recurso-duplicado.error';

/**
 * El `id` chocó con la llave primaria pero la fila no es visible para esta
 * sesión: pertenece a otro negocio. La llave es global, los negocios no.
 *
 * El mensaje no dice de quién es — decirlo confirmaría la existencia del
 * recurso en otro tenant, justo lo que el Doc 5 Bloque 3 evita al preferir 404
 * sobre 403. No es enumerable: habría que adivinar un UUID v4 entero.
 *
 * Se exporta como función para que los dos flujos de alta idempotente que
 * existen —el general de acá y el de los hijos del Encargo, que necesita su
 * propio reintento porque un P2002 aborta la transacción de Postgres— compartan
 * exactamente esta decisión y este texto.
 */
export function conflictoIdAjeno(): ConflictException {
  return new ConflictException('El id enviado ya está en uso.');
}

export interface ResultadoCreacion<T> {
  recurso: T;
  /** `false` cuando el id ya existía: la respuesta es 200, no 201. */
  creado: boolean;
}

export interface OpcionesCreacion<T> {
  /** UUID generado en el dispositivo; `undefined` si lo genera el servidor. */
  id?: string;
  buscar: (id: string) => Promise<T | null>;
  crear: () => Promise<T>;
}

/**
 * Alta idempotente respecto del UUID que genera el dispositivo.
 *
 * **Por qué existe (decisión del módulo `clientes`, generalizada acá).** El
 * Doc 3 fija identificadores generados en el cliente y el Doc 5 Bloque 1 dice
 * que la cola Outbox reintenta cada escritura "como una llamada REST normal".
 * Si se pierde la *respuesta* (no el request), ese reintento crearía un
 * duplicado. Con esto, reintentar es inofensivo: el mismo id devuelve el mismo
 * recurso.
 *
 * Vive en shared/ porque el Doc 5 Bloque 2 tiene seis altas con la misma forma
 * (`/clientes`, `/servicios`, `/encargos`, `/trabajos`, `/pagos`, `/notas`).
 * Concentrar acá el caso del 409 importa más que ahorrar líneas: es una
 * decisión de seguridad, y seis copias serían seis oportunidades de que una se
 * desviara.
 */
export async function crearIdempotente<T>(
  opciones: OpcionesCreacion<T>,
): Promise<ResultadoCreacion<T>> {
  const { id, buscar, crear } = opciones;

  if (id) {
    const existente = await buscar(id);
    if (existente) {
      return { recurso: existente, creado: false };
    }
  }

  try {
    return { recurso: await crear(), creado: true };
  } catch (error) {
    if (!(error instanceof RecursoDuplicadoError)) {
      throw error;
    }

    // Dos reintentos en paralelo con el mismo id: ambos pasan la comprobación
    // de arriba y uno choca contra la llave primaria. El que pierde relee y
    // devuelve lo que escribió el otro.
    const existente = await buscar(error.id);
    if (existente) {
      return { recurso: existente, creado: false };
    }

    throw conflictoIdAjeno();
  }
}
