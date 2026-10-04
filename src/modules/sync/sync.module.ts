import { Module } from '@nestjs/common';
import { SyncRepository } from './application/ports/sync.repository';
import { SincronizarUseCase } from './application/sincronizar.use-case';
import { PrismaSyncRepository } from './infrastructure/prisma-sync.repository';
import { SyncController } from './presentation/sync.controller';

// Doc 5, Bloque 1. Módulo de solo lectura: no tiene capa `domain/` con
// entidades porque no sostiene invariantes, solo proyecta filas de las 9
// tablas (lectura cross-agregado, permitida por el Doc 2).
@Module({
  controllers: [SyncController],
  providers: [SincronizarUseCase, { provide: SyncRepository, useClass: PrismaSyncRepository }],
})
export class SyncModule {}
