import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  OrigenPagoCatalogo,
  OrigenPagoRepository,
} from '../application/ports/origen-pago.repository';

/**
 * Usa `PrismaService` crudo: `origenes_pago` no tiene `negocio_id`, así que
 * no hay nada que aislar por tenant (mismo caso que `existeOrigenPago`).
 */
@Injectable()
export class PrismaOrigenPagoRepository extends OrigenPagoRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  listar(): Promise<OrigenPagoCatalogo[]> {
    return this.prisma.origenPago.findMany({
      select: { id: true, nombre: true, activo: true },
      orderBy: { id: 'asc' },
    });
  }
}
