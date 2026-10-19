import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module';
import { ActualizarEncargoUseCase } from './application/use-cases/actualizar-encargo.use-case';
import { CambiarEstadoUseCase } from './application/use-cases/cambiar-estado.use-case';
import { CrearEncargoUseCase } from './application/use-cases/crear-encargo.use-case';
import { ListarEncargosDeClienteUseCase } from './application/use-cases/listar-encargos-de-cliente.use-case';
import { ListarEncargosUseCase } from './application/use-cases/listar-encargos.use-case';
import { ObtenerEncargoUseCase } from './application/use-cases/obtener-encargo.use-case';
import { ActualizarObjetoUseCase } from './application/use-cases/actualizar-objeto.use-case';
import { ActualizarTrabajoUseCase } from './application/use-cases/actualizar-trabajo.use-case';
import { CrearMaterialUseCase } from './application/use-cases/crear-material.use-case';
import { CrearNotaUseCase } from './application/use-cases/crear-nota.use-case';
import { CrearObjetoUseCase } from './application/use-cases/crear-objeto.use-case';
import { CrearPagoUseCase } from './application/use-cases/crear-pago.use-case';
import { CrearTrabajoUseCase } from './application/use-cases/crear-trabajo.use-case';
import { EliminarMaterialUseCase } from './application/use-cases/eliminar-material.use-case';
import { EliminarObjetoUseCase } from './application/use-cases/eliminar-objeto.use-case';
import { EliminarPagoUseCase } from './application/use-cases/eliminar-pago.use-case';
import { EliminarTrabajoUseCase } from './application/use-cases/eliminar-trabajo.use-case';
import { ReservarBloqueNumerosUseCase } from './application/use-cases/reservar-bloque-numeros.use-case';
import { EncargoRepository, NumeracionRepository } from './domain/repositories/encargo.repository';
import { PrismaEncargoRepository } from './infrastructure/prisma-encargo.repository';
import { PrismaNumeracionRepository } from './infrastructure/prisma-numeracion.repository';
import { ClienteEncargosController } from './presentation/cliente-encargos.controller';
import { EncargosController } from './presentation/encargos.controller';

// Doc 8, Bloque 1. Importa ClientesModule para usar su `ClienteRepository`
// (solo lectura) y comprobar que el `cliente_id` de un encargo existe en este
// negocio — referencia entre agregados por id, como manda el Doc 2 — y para
// el 404 de `GET /clientes/{id}/encargos`.
@Module({
  imports: [ClientesModule],
  controllers: [EncargosController, ClienteEncargosController],
  providers: [
    ListarEncargosUseCase,
    ListarEncargosDeClienteUseCase,
    CrearEncargoUseCase,
    ObtenerEncargoUseCase,
    ActualizarEncargoUseCase,
    CambiarEstadoUseCase,
    ReservarBloqueNumerosUseCase,
    CrearObjetoUseCase,
    ActualizarObjetoUseCase,
    EliminarObjetoUseCase,
    CrearTrabajoUseCase,
    ActualizarTrabajoUseCase,
    EliminarTrabajoUseCase,
    CrearMaterialUseCase,
    EliminarMaterialUseCase,
    CrearPagoUseCase,
    EliminarPagoUseCase,
    CrearNotaUseCase,
    { provide: EncargoRepository, useClass: PrismaEncargoRepository },
    { provide: NumeracionRepository, useClass: PrismaNumeracionRepository },
  ],
  exports: [EncargoRepository],
})
export class EncargosModule {}
