import { Injectable } from '@nestjs/common';
import { Monto } from '../../../shared/domain/monto';
import { PrismaNegocio } from '../../../shared/infrastructure/prisma/prisma-negocio';
import {
  HistorialCliente,
  HistorialClienteConsulta,
} from '../application/ports/historial-cliente.consulta';

/**
 * Las tres consultas van en una sola transacción para que el resumen sea una
 * foto coherente: sin eso, un pago que entra entre el conteo y la suma podría
 * mostrarse sumado a un encargo que todavía no se contó.
 *
 * `ultimoEncargoEn` sale de `creado_en`, que es reloj del **servidor**: el
 * encargo no tiene otra fecha de alta. Un encargo creado offline quedará con
 * la fecha en que sincronizó — para "Última visita" el desfase es tolerable,
 * y la alternativa sería agregar una columna de hecho nueva al Doc 4.
 */
@Injectable()
export class PrismaHistorialClienteConsulta extends HistorialClienteConsulta {
  constructor(private readonly prisma: PrismaNegocio) {
    super();
  }

  async obtener(clienteId: string): Promise<HistorialCliente> {
    const [totalEncargos, pagos, ultimo] = await this.prisma.transaccion((tx) =>
      Promise.all([
        tx.encargo.count({ where: { clienteId } }),
        tx.pago.aggregate({
          _sum: { monto: true },
          where: { eliminadoEn: null, encargo: { clienteId } },
        }),
        tx.encargo.findFirst({
          where: { clienteId },
          orderBy: { creadoEn: 'desc' },
          select: { creadoEn: true },
        }),
      ]),
    );

    return {
      totalEncargos,
      // Decimal → string → Monto, como en el resto de repositorios: es el único
      // punto que toca `Prisma.Decimal`. Sin pagos, `_sum` es null.
      totalPagado: pagos._sum.monto ? Monto.desde(pagos._sum.monto.toString()) : Monto.CERO,
      ultimoEncargoEn: ultimo?.creadoEn ?? null,
    };
  }
}
