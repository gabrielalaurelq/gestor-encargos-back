import { Injectable } from '@nestjs/common';
import { EncargoEstado } from '@prisma/client';
import { Monto } from '../../../shared/domain/monto';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  DatosAvisos,
  NegocioParaAvisos,
  RecordatoriosRepository,
} from '../application/ports/recordatorios.repository';

/**
 * Sobre `PrismaService` + `enNegocio()`, como los jobs de mantenimiento: un
 * cron no tiene sesión, y `PrismaNegocio` (REQUEST-scoped) la necesita.
 */
@Injectable()
export class PrismaRecordatoriosRepository extends RecordatoriosRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  listarNegocios(): Promise<NegocioParaAvisos[]> {
    return this.prisma.negocio.findMany({ select: { id: true, diasAvisoNoRecoge: true } });
  }

  datosParaAvisos(negocioId: string): Promise<DatosAvisos> {
    return this.prisma.enNegocio(negocioId, async (tx) => {
      const [dispositivos, filas] = await Promise.all([
        tx.dispositivo.findMany({
          where: { fcmToken: { not: null } },
          select: { fcmToken: true },
        }),
        // Lo que puede generar algún aviso: todo lo que sigue abierto, más los
        // entregados que todavía deben (resumen de saldos). Los índices
        // parciales de la migración inicial cubren las dos ramas.
        tx.encargo.findMany({
          where: {
            estado: { not: EncargoEstado.CANCELADO },
            OR: [
              { fechaEntregaReal: null },
              { estado: EncargoEstado.ENTREGADO, saldoPendiente: { gt: 0 } },
            ],
          },
          select: {
            id: true,
            numero: true,
            descripcion: true,
            estado: true,
            fechaEntregaAcordada: true,
            fechaListo: true,
            fechaEntregaReal: true,
            saldoPendiente: true,
            cliente: { select: { nombre: true } },
          },
          orderBy: [{ fechaEntregaAcordada: 'asc' }, { numero: 'asc' }],
        }),
      ]);

      return {
        tokens: dispositivos.map((d) => d.fcmToken!),
        encargos: filas.map((fila) => ({
          id: fila.id,
          numero: fila.numero,
          descripcion: fila.descripcion,
          cliente: fila.cliente.nombre,
          estado: fila.estado,
          fechaEntregaAcordada: fila.fechaEntregaAcordada,
          fechaListo: fila.fechaListo,
          fechaEntregaReal: fila.fechaEntregaReal,
          saldoCentimos: Monto.desde(fila.saldoPendiente.toString()).centimos,
        })),
      };
    });
  }

  async soltarTokens(negocioId: string, tokens: string[]): Promise<void> {
    await this.prisma.enNegocio(negocioId, (tx) =>
      tx.dispositivo.updateMany({ where: { fcmToken: { in: tokens } }, data: { fcmToken: null } }),
    );
  }
}
