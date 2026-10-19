import { Module } from '@nestjs/common';
import { ActualizarClienteUseCase } from './application/use-cases/actualizar-cliente.use-case';
import { CrearClienteUseCase } from './application/use-cases/crear-cliente.use-case';
import { ListarClientesUseCase } from './application/use-cases/listar-clientes.use-case';
import { ObtenerClienteUseCase } from './application/use-cases/obtener-cliente.use-case';
import { HistorialClienteConsulta } from './application/ports/historial-cliente.consulta';
import { ClienteRepository } from './domain/repositories/cliente.repository';
import { PrismaClienteRepository } from './infrastructure/prisma-cliente.repository';
import { PrismaHistorialClienteConsulta } from './infrastructure/prisma-historial-cliente.consulta';
import { ClientesController } from './presentation/clientes.controller';

// Doc 8, Bloque 1: un @Module() por Bounded Context. Los casos de uso
// dependen de `ClienteRepository` (abstracta); acá se ata a su implementación
// Prisma. `PrismaNegocio` llega del PrismaModule global.
//
// Se exporta ClienteRepository porque Encargos lo usa para comprobar que el
// `cliente_id` de un encargo existe en este negocio, y para el 404 de
// `GET /clientes/{id}/encargos`.
@Module({
  controllers: [ClientesController],
  providers: [
    ListarClientesUseCase,
    CrearClienteUseCase,
    ObtenerClienteUseCase,
    ActualizarClienteUseCase,
    { provide: ClienteRepository, useClass: PrismaClienteRepository },
    { provide: HistorialClienteConsulta, useClass: PrismaHistorialClienteConsulta },
  ],
  exports: [ClienteRepository],
})
export class ClientesModule {}
