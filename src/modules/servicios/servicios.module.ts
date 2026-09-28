import { Module } from '@nestjs/common';
import { ActualizarServicioUseCase } from './application/use-cases/actualizar-servicio.use-case';
import { CrearServicioUseCase } from './application/use-cases/crear-servicio.use-case';
import { ListarServiciosUseCase } from './application/use-cases/listar-servicios.use-case';
import { ServicioRepository } from './domain/repositories/servicio.repository';
import { PrismaServicioRepository } from './infrastructure/prisma-servicio.repository';
import { ServiciosController } from './presentation/servicios.controller';

// Doc 8, Bloque 1. Se exporta ServicioRepository porque Encargos (Sprint 3-4)
// necesitará leer un Servicio del catálogo para copiar su nombre y precio al
// crear un Trabajo (Doc 2, invariante 12) — lectura, nunca escritura.
@Module({
  controllers: [ServiciosController],
  providers: [
    ListarServiciosUseCase,
    CrearServicioUseCase,
    ActualizarServicioUseCase,
    { provide: ServicioRepository, useClass: PrismaServicioRepository },
  ],
  exports: [ServicioRepository],
})
export class ServiciosModule {}
