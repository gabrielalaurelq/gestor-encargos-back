import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { NegocioPropio, NegocioRepository } from '../application/ports/negocio.repository';

const CAMPOS = {
  id: true,
  nombreNegocio: true,
  plan: true,
  planVenceEn: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

/**
 * No confundir con `PrismaNegocio` (shared): ese es el cliente Prisma filtrado
 * por negocio; este es el repositorio del agregado Negocio.
 *
 * Usa `PrismaService` crudo porque `negocios` no tiene columna `negocio_id` y
 * queda fuera del alcance de la extensión y de RLS. El aislamiento acá lo da
 * el `negocioId` de la sesión, que viene del access token ya validado.
 */
@Injectable()
export class PrismaNegocioRepository extends NegocioRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  buscarPorId(negocioId: string): Promise<NegocioPropio | null> {
    return this.prisma.negocio.findUnique({ where: { id: negocioId }, select: CAMPOS });
  }

  actualizarNombre(negocioId: string, nombreNegocio: string | null): Promise<NegocioPropio> {
    return this.prisma.negocio.update({
      where: { id: negocioId },
      data: { nombreNegocio },
      select: CAMPOS,
    });
  }
}
