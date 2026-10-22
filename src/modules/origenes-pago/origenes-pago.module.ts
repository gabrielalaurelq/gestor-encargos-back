import { Module } from '@nestjs/common';
import { OrigenPagoRepository } from './application/ports/origen-pago.repository';
import { ListarOrigenesPagoUseCase } from './application/use-cases/listar-origenes-pago.use-case';
import { PrismaOrigenPagoRepository } from './infrastructure/prisma-origen-pago.repository';
import { OrigenesPagoController } from './presentation/origenes-pago.controller';

// Doc 5 v1.6. El catálogo `origenes_pago` es del sistema (Doc 4, Bloque 1),
// no de un agregado: por eso va en su propio módulo y no en `encargos`.
@Module({
  controllers: [OrigenesPagoController],
  providers: [
    ListarOrigenesPagoUseCase,
    { provide: OrigenPagoRepository, useClass: PrismaOrigenPagoRepository },
  ],
})
export class OrigenesPagoModule {}
