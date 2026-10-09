import { Module } from '@nestjs/common';
import { NegocioRepository } from './application/ports/negocio.repository';
import { ActualizarNegocioUseCase } from './application/use-cases/actualizar-negocio.use-case';
import { ObtenerNegocioUseCase } from './application/use-cases/obtener-negocio.use-case';
import { PrismaNegocioRepository } from './infrastructure/prisma-negocio.repository';
import { NegocioController } from './presentation/negocio.controller';

// Doc 8, Bloque 1. El agregado Negocio (Doc 2 v1.1) tiene su propio módulo:
// es una raíz independiente, aunque su tabla sea también el ancla del
// aislamiento multitenant.
@Module({
  controllers: [NegocioController],
  providers: [
    ObtenerNegocioUseCase,
    ActualizarNegocioUseCase,
    { provide: NegocioRepository, useClass: PrismaNegocioRepository },
  ],
})
export class NegocioModule {}
