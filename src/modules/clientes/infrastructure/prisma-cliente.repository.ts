import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginaResultado } from '../../../shared/presentation/paginacion';
import { PrismaNegocio } from '../../../shared/infrastructure/prisma/prisma-negocio';
import { Cliente } from '../domain/cliente';
import {
  ClienteDuplicadoError,
  ClienteRepository,
  FiltroClientes,
} from '../domain/repositories/cliente.repository';

/** Fila de `clientes` tal como la devuelve Prisma. */
type FilaCliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
};

const CAMPOS: Record<keyof FilaCliente, true> = {
  id: true,
  nombre: true,
  telefono: true,
  creadoEn: true,
  actualizadoEn: true,
};

const VIOLACION_UNICIDAD = 'P2002';

/**
 * Implementación del puerto sobre `PrismaNegocio` (Doc 8, Bloque 1). Al
 * depender de un provider REQUEST-scoped, este repositorio —y con él los
 * casos de uso y el controller— también lo son: cada petición trabaja con un
 * cliente Prisma atado a su propio negocio.
 *
 * Toda consulta va dentro de `transaccion()`: fuera de ella no está fijada
 * `app.negocio_actual` y RLS no devolvería nada (falla cerrado, por diseño).
 */
@Injectable()
export class PrismaClienteRepository extends ClienteRepository {
  constructor(private readonly prisma: PrismaNegocio) {
    super();
  }

  async buscarPorId(id: string): Promise<Cliente | null> {
    const fila = await this.prisma.transaccion((tx) =>
      tx.cliente.findUnique({ where: { id }, select: CAMPOS }),
    );
    return fila ? Cliente.reconstituir(fila) : null;
  }

  async listar(filtro: FiltroClientes): Promise<PaginaResultado<Cliente>> {
    const where = PrismaClienteRepository.construirWhere(filtro.q);

    // El conteo va en la misma transacción que la página: si no, un alta
    // concurrente podría devolver un `total` que no corresponde a `datos`.
    const [filas, total] = await this.prisma.transaccion((tx) =>
      Promise.all([
        tx.cliente.findMany({
          where,
          select: CAMPOS,
          orderBy: { nombre: 'asc' },
          skip: (filtro.pagina - 1) * filtro.porPagina,
          take: filtro.porPagina,
        }),
        tx.cliente.count({ where }),
      ]),
    );

    return { datos: filas.map(Cliente.reconstituir), total };
  }

  async crear(cliente: Cliente): Promise<Cliente> {
    try {
      const fila = await this.prisma.transaccion((tx) =>
        tx.cliente.create({
          // `negocioId` lo inyecta la extensión de PrismaNegocio; los tipos de
          // Prisma lo exigen igual, de ahí el cast (mismo patrón que el resto).
          data: {
            id: cliente.id,
            nombre: cliente.nombre,
            telefono: cliente.telefono?.valor ?? null,
          } as Parameters<typeof tx.cliente.create>[0]['data'],
          select: CAMPOS,
        }),
      );
      return Cliente.reconstituir(fila);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === VIOLACION_UNICIDAD
      ) {
        throw new ClienteDuplicadoError(cliente.id);
      }
      throw error;
    }
  }

  async actualizar(cliente: Cliente): Promise<Cliente> {
    const fila = await this.prisma.transaccion((tx) =>
      tx.cliente.update({
        where: { id: cliente.id },
        data: { nombre: cliente.nombre, telefono: cliente.telefono?.valor ?? null },
        select: CAMPOS,
      }),
    );
    return Cliente.reconstituir(fila);
  }

  /**
   * Búsqueda del Caso 8. `contains` genera `ILIKE '%texto%'`, que **sí** usa
   * los índices GIN `gin_trgm_ops` de la migración inicial sobre
   * `clientes.nombre` y `clientes.telefono` — para eso existe ese operator
   * class. Con menos de 3 caracteres no hay trigramas que extraer y Postgres
   * cae a un recorrido secuencial, acotado de todos modos al propio negocio.
   *
   * El teléfono se compara sensible a mayúsculas a propósito: son dígitos y
   * un `+`, y así la comparación queda idéntica a la que indexó Postgres.
   */
  private static construirWhere(q?: string): Prisma.ClienteWhereInput {
    if (!q) {
      return {};
    }
    return {
      OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { telefono: { contains: q } }],
    };
  }
}
