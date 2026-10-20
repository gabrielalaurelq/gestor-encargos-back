import { Injectable } from '@nestjs/common';
import { NegocioPlan } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  ConteoPurga,
  MantenimientoRepository,
} from '../application/ports/mantenimiento.repository';

/**
 * Usa `PrismaService` y no `PrismaNegocio`: este último es REQUEST-scoped y lee
 * el negocio de la sesión, y un cron no tiene ni petición ni sesión. Cada
 * negocio va en su propia transacción vía `enNegocio()`, que fija
 * `app.negocio_actual` — RLS sigue activo y es el que acota cada `deleteMany`.
 */
@Injectable()
export class PrismaMantenimientoRepository extends MantenimientoRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listarNegocios(): Promise<string[]> {
    const filas = await this.prisma.negocio.findMany({ select: { id: true } });
    return filas.map((fila) => fila.id);
  }

  fotosPorPurgar(negocioId: string, limite: Date): Promise<{ id: string; clave: string }[]> {
    return this.prisma.enNegocio(negocioId, (tx) =>
      tx.foto.findMany({
        where: { eliminadoEn: { lt: limite } },
        select: { id: true, clave: true },
      }),
    );
  }

  purgarTombstones(negocioId: string, limite: Date, fotoIds: string[]): Promise<ConteoPurga> {
    const vencido = { eliminadoEn: { lt: limite } };

    return this.prisma.enNegocio(negocioId, async (tx) => {
      // Solo las fotos cuyo archivo ya se borró de R2 (las que recibe acá), y
      // antes que los objetos: así el CASCADE de abajo no arrastra ninguna.
      const fotos = await tx.foto.deleteMany({ where: { id: { in: fotoIds } } });
      // Materiales antes que trabajos para poder contarlos: borrar el trabajo
      // primero los arrastraría por la FK (CASCADE) sin dejar rastro en el
      // conteo. Con la cascada lógica comparten `eliminado_en`, así que caen
      // en la misma corrida.
      const materiales = await tx.material.deleteMany({ where: vencido });
      const trabajos = await tx.trabajo.deleteMany({ where: vencido });
      const objetos = await tx.objetoRecibido.deleteMany({
        // `fotos.objeto_recibido_id` es CASCADE: borrar un objeto que todavía
        // tiene fotos (vivas, o con tombstone más reciente) borraría esas filas
        // **sin borrar sus archivos en R2**. Ese objeto espera a la corrida en
        // que sus fotos ya se hayan purgado arriba.
        where: { ...vencido, fotos: { none: {} } },
      });
      const pagos = await tx.pago.deleteMany({ where: vencido });

      return {
        fotos: fotos.count,
        materiales: materiales.count,
        trabajos: trabajos.count,
        objetos_recibidos: objetos.count,
        pagos: pagos.count,
      };
    });
  }

  async revertirPlanesVencidos(ahora: Date): Promise<number> {
    // `negocios` no tiene RLS (define al tenant): una sola sentencia global.
    const { count } = await this.prisma.negocio.updateMany({
      where: { plan: NegocioPlan.PREMIUM, planVenceEn: { lt: ahora } },
      data: { plan: NegocioPlan.FREE },
    });
    return count;
  }
}
