import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZONA_NEGOCIO } from '../../../shared/domain/fecha';
import { EvaluarRecordatoriosUseCase } from '../application/evaluar-recordatorios.use-case';

/**
 * Doc 8 Bloque 3: diario a las 9:00 de Lima ("horario fijo razonable, ej.
 * 9am", PRD 13). Solo dispara el caso de uso; misma nota de instancia única
 * que los jobs de mantenimiento — con varias réplicas, cada una mandaría sus
 * propias notificaciones, y aquí **sí** se notaría (avisos repetidos).
 */
@Injectable()
export class EvaluarRecordatoriosJob {
  constructor(private readonly evaluar: EvaluarRecordatoriosUseCase) {}

  @Cron('0 9 * * *', { name: 'evaluar-recordatorios', timeZone: ZONA_NEGOCIO })
  async ejecutar(): Promise<void> {
    await this.evaluar.execute();
  }
}
