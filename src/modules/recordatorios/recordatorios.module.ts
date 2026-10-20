import { Module } from '@nestjs/common';
import { Notificador } from '../../shared/application/notificador';
import { FcmNotificador } from '../../shared/infrastructure/fcm/fcm-notificador';
import { EvaluarRecordatoriosUseCase } from './application/evaluar-recordatorios.use-case';
import { RecordatoriosRepository } from './application/ports/recordatorios.repository';
import { PrismaRecordatoriosRepository } from './infrastructure/prisma-recordatorios.repository';
import { EvaluarRecordatoriosJob } from './presentation/evaluar-recordatorios.job';

// PRD 13 / Doc 8 Bloque 3. Sin controllers: el punto de entrada es el cron.
// Las reglas (domain/) son puras; FCM entra por el puerto `Notificador`.
@Module({
  providers: [
    EvaluarRecordatoriosUseCase,
    EvaluarRecordatoriosJob,
    { provide: RecordatoriosRepository, useClass: PrismaRecordatoriosRepository },
    { provide: Notificador, useClass: FcmNotificador },
  ],
})
export class RecordatoriosModule {}
