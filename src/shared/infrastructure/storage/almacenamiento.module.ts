import { Global, Module } from '@nestjs/common';
import { AlmacenamientoFotos } from '../../application/almacenamiento-fotos';
import { R2AlmacenamientoFotos } from './r2-almacenamiento-fotos';

// Doc 3 (`shared/infrastructure/storage/`). Global, como PrismaModule: lo usan
// encargos, sync y mantenimiento, y ninguno es dueño del almacenamiento.
@Global()
@Module({
  providers: [{ provide: AlmacenamientoFotos, useClass: R2AlmacenamientoFotos }],
  exports: [AlmacenamientoFotos],
})
export class AlmacenamientoModule {}
