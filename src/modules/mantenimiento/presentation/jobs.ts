import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PurgarTombstonesUseCase } from '../application/purgar-tombstones.use-case';
import { RevertirPlanesVencidosUseCase } from '../application/revertir-planes-vencidos.use-case';
import { ZONA_NEGOCIO } from '../../../shared/domain/fecha';

/**
 * Los crons corren en `ZONA_NEGOCIO` (Lima), no en el UTC del servidor: "las
 * 3 de la mañana" es hora del negocio, igual que el "hoy" de `fecha.ts`.
 *
 * Los jobs son puntos de entrada, como los controllers: solo disparan el caso
 * de uso. Toda la lógica está en `application/`, y los tests llaman a los
 * casos de uso directamente, sin esperar al reloj.
 *
 * **Una sola instancia del backend (MVP)**, igual que el rate limiting en
 * memoria: con varias réplicas cada una correría su cron. Los dos jobs son
 * idempotentes, así que duplicarlos no corrompe nada, solo repite trabajo; al
 * escalar horizontalmente habrá que añadir un lock (p. ej. `pg_try_advisory_lock`).
 */
@Injectable()
export class PurgaSoftDeleteJob {
  constructor(private readonly purgar: PurgarTombstonesUseCase) {}

  // Doc 8 Bloque 3: semanal. Domingo 03:00, la hora de menos uso.
  @Cron('0 3 * * 0', { name: 'purga-soft-delete', timeZone: ZONA_NEGOCIO })
  async ejecutar(): Promise<void> {
    await this.purgar.execute();
  }
}

@Injectable()
export class RevisarVencimientosPlanJob {
  constructor(private readonly revertir: RevertirPlanesVencidosUseCase) {}

  // Doc 10 Bloque 2: diario. 00:10, apenas empieza el día en que ya venció.
  @Cron('10 0 * * *', { name: 'revisar-vencimientos-plan', timeZone: ZONA_NEGOCIO })
  async ejecutar(): Promise<void> {
    await this.revertir.execute();
  }
}
