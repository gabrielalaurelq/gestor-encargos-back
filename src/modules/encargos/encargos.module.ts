import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module';
import { ActualizarEncargoUseCase } from './application/use-cases/actualizar-encargo.use-case';
import { CambiarEstadoUseCase } from './application/use-cases/cambiar-estado.use-case';
import { CrearEncargoUseCase } from './application/use-cases/crear-encargo.use-case';
import { ListarEncargosUseCase } from './application/use-cases/listar-encargos.use-case';
import { ObtenerEncargoUseCase } from './application/use-cases/obtener-encargo.use-case';
import { ReservarBloqueNumerosUseCase } from './application/use-cases/reservar-bloque-numeros.use-case';
import { EncargoRepository, NumeracionRepository } from './domain/repositories/encargo.repository';
import { PrismaEncargoRepository } from './infrastructure/prisma-encargo.repository';
import { PrismaNumeracionRepository } from './infrastructure/prisma-numeracion.repository';
import { EncargosController } from './presentation/encargos.controller';

// Doc 8, Bloque 1. Importa ClientesModule para usar su `ClienteRepository`
// (solo lectura) y comprobar que el `cliente_id` de un encargo existe en este
// negocio — referencia entre agregados por id, como manda el Doc 2.
@Module({
  imports: [ClientesModule],
  controllers: [EncargosController],
  providers: [
    ListarEncargosUseCase,
    CrearEncargoUseCase,
    ObtenerEncargoUseCase,
    ActualizarEncargoUseCase,
    CambiarEstadoUseCase,
    ReservarBloqueNumerosUseCase,
    { provide: EncargoRepository, useClass: PrismaEncargoRepository },
    { provide: NumeracionRepository, useClass: PrismaNumeracionRepository },
  ],
  exports: [EncargoRepository],
})
export class EncargosModule {}
