import { Injectable } from '@nestjs/common';
import { EncargoEstado, Prisma } from '@prisma/client';
import { RecursoDuplicadoError } from '../../../shared/domain/recurso-duplicado.error';
import { Monto } from '../../../shared/domain/monto';
import { PrismaNegocio } from '../../../shared/infrastructure/prisma/prisma-negocio';
import { PaginaResultado } from '../../../shared/presentation/paginacion';
import { Encargo, SumasEncargo } from '../domain/encargo';
import { EncargoNumeroEnUsoError } from '../domain/errores';
import { EstadoEncargo } from '../domain/estado-encargo';
import { EncargoRepository, FiltroEncargos } from '../domain/repositories/encargo.repository';

const CAMPOS = {
  id: true,
  clienteId: true,
  numero: true,
  descripcion: true,
  estado: true,
  precioTotal: true,
  descuento: true,
  saldoPendiente: true,
  fechaEntregaPrometida: true,
  fechaEntregaAcordada: true,
  fechaListo: true,
  fechaEntregaReal: true,
  ubicacionFisica: true,
  notasGenerales: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

type FilaEncargo = {
  id: string;
  clienteId: string;
  numero: number | null;
  descripcion: string;
  estado: EncargoEstado;
  precioTotal: Prisma.Decimal;
  descuento: Prisma.Decimal;
  saldoPendiente: Prisma.Decimal;
  fechaEntregaPrometida: Date;
  fechaEntregaAcordada: Date;
  fechaListo: Date | null;
  fechaEntregaReal: Date | null;
  ubicacionFisica: string | null;
  notasGenerales: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
};

const VIOLACION_UNICIDAD = 'P2002';

@Injectable()
export class PrismaEncargoRepository extends EncargoRepository {
  constructor(private readonly prisma: PrismaNegocio) {
    super();
  }

  async buscarPorId(id: string): Promise<Encargo | null> {
    const fila = await this.prisma.transaccion((tx) =>
      tx.encargo.findUnique({ where: { id }, select: CAMPOS }),
    );
    return fila ? PrismaEncargoRepository.aDominio(fila) : null;
  }

  async listar(filtro: FiltroEncargos): Promise<PaginaResultado<Encargo>> {
    const where = PrismaEncargoRepository.construirWhere(filtro);

    const [filas, total] = await this.prisma.transaccion((tx) =>
      Promise.all([
        tx.encargo.findMany({
          where,
          select: CAMPOS,
          // Los listados que alimenta (Dashboard, Balance, Calendario) se leen
          // por fecha de compromiso; el número desempata dentro del día.
          orderBy: [{ fechaEntregaAcordada: 'asc' }, { numero: 'asc' }],
          skip: (filtro.pagina - 1) * filtro.porPagina,
          take: filtro.porPagina,
        }),
        tx.encargo.count({ where }),
      ]),
    );

    return { datos: filas.map(PrismaEncargoRepository.aDominio), total };
  }

  async crear(encargo: Encargo): Promise<Encargo> {
    try {
      const fila = await this.prisma.transaccion((tx) =>
        tx.encargo.create({
          // `negocioId` lo inyecta la extensión de PrismaNegocio; los tipos de
          // Prisma lo exigen igual, de ahí el cast.
          data: {
            id: encargo.id,
            clienteId: encargo.clienteId,
            ...PrismaEncargoRepository.camposMutables(encargo),
          } as Parameters<typeof tx.encargo.create>[0]['data'],
          select: CAMPOS,
        }),
      );
      return PrismaEncargoRepository.aDominio(fila);
    } catch (error) {
      throw await this.traducirConflicto(error, encargo);
    }
  }

  async actualizar(encargo: Encargo): Promise<Encargo> {
    try {
      const fila = await this.prisma.transaccion((tx) =>
        tx.encargo.update({
          where: { id: encargo.id },
          // Ni `id` ni `clienteId` entran: el PATCH del Doc 5 no los incluye y
          // `negocioId` es inmutable por el invariante 20.
          data: PrismaEncargoRepository.camposMutables(encargo),
          select: CAMPOS,
        }),
      );
      return PrismaEncargoRepository.aDominio(fila);
    } catch (error) {
      throw await this.traducirConflicto(error, encargo);
    }
  }

  /**
   * Suma de Trabajos y Pagos vivos. Hoy devuelve 0 y 0 porque no hay forma de
   * crearlos todavía, pero la consulta ya es la definitiva: excluye los
   * tombstones (`eliminado_en`), como exige el Doc 4 Bloque 3 — un trabajo
   * borrado no puede seguir sumando al precio total.
   */
  async sumas(encargoId: string): Promise<SumasEncargo> {
    const [trabajos, pagos] = await this.prisma.transaccion((tx) =>
      Promise.all([
        tx.trabajo.aggregate({
          where: { encargoId, eliminadoEn: null },
          _sum: { precio: true },
        }),
        tx.pago.aggregate({
          where: { encargoId, eliminadoEn: null },
          _sum: { monto: true },
        }),
      ]),
    );

    return {
      trabajos: PrismaEncargoRepository.aMonto(trabajos._sum.precio),
      pagos: PrismaEncargoRepository.aMonto(pagos._sum.monto),
    };
  }

  private static construirWhere(filtro: FiltroEncargos): Prisma.EncargoWhereInput {
    const where: Prisma.EncargoWhereInput = {};

    if (filtro.estado) {
      where.estado = filtro.estado as EncargoEstado;
    }
    if (filtro.clienteId) {
      where.clienteId = filtro.clienteId;
    }
    if (filtro.fechaDesde || filtro.fechaHasta) {
      where.fechaEntregaAcordada = {
        ...(filtro.fechaDesde ? { gte: filtro.fechaDesde } : {}),
        ...(filtro.fechaHasta ? { lte: filtro.fechaHasta } : {}),
      };
    }

    return where;
  }

  /** Todo lo que sí puede cambiar a lo largo de la vida del encargo. */
  private static camposMutables(encargo: Encargo) {
    return {
      numero: encargo.numero,
      descripcion: encargo.descripcion,
      estado: encargo.estado as EncargoEstado,
      precioTotal: encargo.precioTotal.texto,
      descuento: encargo.descuento.texto,
      saldoPendiente: encargo.saldoPendiente.texto,
      fechaEntregaPrometida: encargo.fechas.entregaPrometida,
      fechaEntregaAcordada: encargo.fechas.entregaAcordada,
      fechaListo: encargo.fechas.listo,
      fechaEntregaReal: encargo.fechas.entregaReal,
      ubicacionFisica: encargo.ubicacionFisica,
      notasGenerales: encargo.notasGenerales,
    };
  }

  private static aDominio(fila: FilaEncargo): Encargo {
    return Encargo.reconstituir({
      ...fila,
      estado: fila.estado as EstadoEncargo,
      precioTotal: fila.precioTotal.toString(),
      descuento: fila.descuento.toString(),
      saldoPendiente: fila.saldoPendiente.toString(),
    });
  }

  private static aMonto(valor: Prisma.Decimal | null): Monto {
    return valor === null ? Monto.CERO : Monto.desde(valor.toString());
  }

  /**
   * Dos restricciones únicas distintas terminan en el mismo código P2002: la
   * llave primaria y `UNIQUE (negocio_id, numero)`. Confundirlas daría un
   * mensaje equivocado —un número repetido se reportaría como id repetido, y
   * además como 409 en vez de 422, porque el id duplicado pasa por la lógica
   * de idempotencia—.
   *
   * **El error no dice cuál falló.** Dentro de una transacción interactiva,
   * Prisma 5 devuelve `meta.target: null` y el mensaje "Unique constraint
   * failed on the (not available)" (comprobado contra este schema). Así que se
   * le pregunta a la base: si ya hay otro encargo con ese número, fue la
   * restricción del número; si no, fue la llave primaria.
   *
   * La consulta extra solo ocurre cuando ya hubo conflicto, nunca en el camino
   * normal. Queda una carrera teórica —dos altas simultáneas con el mismo
   * número podrían dar 409 en vez de 422—, pero la integridad la garantiza la
   * restricción de todos modos: nunca entran dos filas con el mismo número.
   */
  private async traducirConflicto(error: unknown, encargo: Encargo): Promise<unknown> {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== VIOLACION_UNICIDAD
    ) {
      return error;
    }

    if (encargo.numero !== null) {
      const duenoDelNumero = await this.prisma.transaccion((tx) =>
        tx.encargo.findFirst({ where: { numero: encargo.numero }, select: { id: true } }),
      );

      if (duenoDelNumero && duenoDelNumero.id !== encargo.id) {
        return new EncargoNumeroEnUsoError(encargo.numero);
      }
    }

    return new RecursoDuplicadoError('encargo', encargo.id);
  }
}
