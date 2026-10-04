import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { BloqueNumeros, NumeracionRepository } from '../domain/repositories/encargo.repository';

/**
 * Reserva de bloques Hi/Lo (Doc 3, ADR-008).
 *
 * Usa `PrismaService` crudo y recibe el `negocioId` explícito porque `negocios`
 * es la tabla que **define** al tenant: no tiene columna `negocio_id`, así que
 * ni la extensión de filtrado ni RLS la alcanzan. Mismo caso que
 * `PrismaAuthRepository`.
 *
 * La reserva es un solo `UPDATE ... SET siguiente = siguiente + n RETURNING`,
 * que Postgres resuelve bloqueando la fila: dos dispositivos pidiendo bloque a
 * la vez se serializan y reciben rangos distintos. Leer y después escribir en
 * dos pasos sí podría entregar el mismo rango dos veces.
 */
@Injectable()
export class PrismaNumeracionRepository extends NumeracionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async reservarBloque(negocioId: string, tamano: number): Promise<BloqueNumeros> {
    const { siguienteBloqueNumeros } = await this.prisma.negocio.update({
      where: { id: negocioId },
      data: { siguienteBloqueNumeros: { increment: tamano } },
      select: { siguienteBloqueNumeros: true },
    });

    // `update` devuelve el valor ya incrementado: el bloque entregado es el
    // tramo que quedó atrás.
    return {
      desde: siguienteBloqueNumeros - tamano,
      hasta: siguienteBloqueNumeros - 1,
    };
  }
}
