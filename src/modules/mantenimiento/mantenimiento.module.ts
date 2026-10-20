import { Module } from '@nestjs/common';
import { MantenimientoRepository } from './application/ports/mantenimiento.repository';
import { PurgarTombstonesUseCase } from './application/purgar-tombstones.use-case';
import { RevertirPlanesVencidosUseCase } from './application/revertir-planes-vencidos.use-case';
import { PrismaMantenimientoRepository } from './infrastructure/prisma-mantenimiento.repository';
import { PurgaSoftDeleteJob, RevisarVencimientosPlanJob } from './presentation/jobs';

// Doc 8 Bloque 3 / Doc 10: jobs programados de mantenimiento. Sin controllers:
// sus puntos de entrada son crons (`ScheduleModule` se registra en AppModule).
// `EvaluarRecordatoriosJob` no vive acá: necesita FCM y tiene su propio bloque.
@Module({
  providers: [
    PurgarTombstonesUseCase,
    RevertirPlanesVencidosUseCase,
    PurgaSoftDeleteJob,
    RevisarVencimientosPlanJob,
    { provide: MantenimientoRepository, useClass: PrismaMantenimientoRepository },
  ],
})
export class MantenimientoModule {}
