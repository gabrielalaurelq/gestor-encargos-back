import { Injectable, Logger } from '@nestjs/common';
import { MantenimientoRepository } from './ports/mantenimiento.repository';

/**
 * `RevisarVencimientosPlanJob` (Doc 10, Bloque 2): un negocio PREMIUM cuyo
 * `plan_vence_en` ya pasó sin una renovación confirmada vuelve a FREE.
 *
 * `plan_vence_en` se conserva: deja constancia de cuándo venció. Lo pisa la
 * pasarela al confirmar la próxima renovación.
 */
@Injectable()
export class RevertirPlanesVencidosUseCase {
  private readonly logger = new Logger(RevertirPlanesVencidosUseCase.name);

  constructor(private readonly repositorio: MantenimientoRepository) {}

  async execute(ahora: Date = new Date()): Promise<number> {
    const revertidos = await this.repositorio.revertirPlanesVencidos(ahora);
    this.logger.log({ revertidos }, 'Revisión de vencimientos de plan terminada');
    return revertidos;
  }
}
