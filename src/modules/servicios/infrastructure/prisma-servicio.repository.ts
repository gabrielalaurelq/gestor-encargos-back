import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RecursoDuplicadoError } from '../../../shared/domain/recurso-duplicado.error';
import { PrismaNegocio } from '../../../shared/infrastructure/prisma/prisma-negocio';
import { PaginaResultado } from '../../../shared/presentation/paginacion';
import { FiltroServicios, ServicioRepository } from '../domain/repositories/servicio.repository';
import { Servicio } from '../domain/servicio';

const CAMPOS = {
  id: true,
  nombre: true,
  precio: true,
  activo: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

type FilaServicio = {
  id: string;
  nombre: string;
  precio: Prisma.Decimal;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
};

const VIOLACION_UNICIDAD = 'P2002';

/**
 * Implementación del puerto sobre `PrismaNegocio` (Doc 8, Bloque 1).
 *
 * Es la única frontera con `Prisma.Decimal`: hacia adentro solo circula el VO
 * `Monto` (la capa `domain/` no puede importar Prisma). `Decimal.toString()`
 * da "20.00", que `Monto.desde()` parsea exacto, sin pasar por un float.
 */
@Injectable()
export class PrismaServicioRepository extends ServicioRepository {
  constructor(private readonly prisma: PrismaNegocio) {
    super();
  }

  async buscarPorId(id: string): Promise<Servicio | null> {
    const fila = await this.prisma.transaccion((tx) =>
      tx.servicio.findUnique({ where: { id }, select: CAMPOS }),
    );
    return fila ? PrismaServicioRepository.aDominio(fila) : null;
  }

  async listar(filtro: FiltroServicios): Promise<PaginaResultado<Servicio>> {
    const where: Prisma.ServicioWhereInput = filtro.incluirInactivos ? {} : { activo: true };

    const [filas, total] = await this.prisma.transaccion((tx) =>
      Promise.all([
        tx.servicio.findMany({
          where,
          select: CAMPOS,
          orderBy: { nombre: 'asc' },
          skip: (filtro.pagina - 1) * filtro.porPagina,
          take: filtro.porPagina,
        }),
        tx.servicio.count({ where }),
      ]),
    );

    return { datos: filas.map(PrismaServicioRepository.aDominio), total };
  }

  async crear(servicio: Servicio): Promise<Servicio> {
    try {
      const fila = await this.prisma.transaccion((tx) =>
        tx.servicio.create({
          // `negocioId` lo inyecta la extensión de PrismaNegocio; los tipos de
          // Prisma lo exigen igual, de ahí el cast.
          data: {
            id: servicio.id,
            nombre: servicio.nombre,
            precio: servicio.precio.texto,
            activo: servicio.activo,
          } as Parameters<typeof tx.servicio.create>[0]['data'],
          select: CAMPOS,
        }),
      );
      return PrismaServicioRepository.aDominio(fila);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === VIOLACION_UNICIDAD
      ) {
        throw new RecursoDuplicadoError('servicio', servicio.id);
      }
      throw error;
    }
  }

  async actualizar(servicio: Servicio): Promise<Servicio> {
    const fila = await this.prisma.transaccion((tx) =>
      tx.servicio.update({
        where: { id: servicio.id },
        data: { precio: servicio.precio.texto, activo: servicio.activo },
        select: CAMPOS,
      }),
    );
    return PrismaServicioRepository.aDominio(fila);
  }

  private static aDominio(fila: FilaServicio): Servicio {
    return Servicio.reconstituir({ ...fila, precio: fila.precio.toString() });
  }
}
