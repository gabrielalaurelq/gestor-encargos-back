import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module';
import { EncargosModule } from '../encargos/encargos.module';
import { BuscarUseCase } from './application/buscar.use-case';
import { BusquedaController } from './presentation/busqueda.controller';

// Doc 5, Bloque 4 / PRD 16. Lectura cross-agregado de solo consulta, como
// `sync`: sin capa `domain/` porque no sostiene invariantes. Usa los
// repositorios que exportan Clientes y Encargos, solo para leer.
@Module({
  imports: [ClientesModule, EncargosModule],
  controllers: [BusquedaController],
  providers: [BuscarUseCase],
})
export class BusquedaModule {}
