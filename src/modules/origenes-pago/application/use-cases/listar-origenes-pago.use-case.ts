import { Injectable } from '@nestjs/common';
import { OrigenPagoCatalogo, OrigenPagoRepository } from '../ports/origen-pago.repository';

/**
 * `GET /origenes-pago` (Doc 5 v1.6): la app los guarda en Drift para ofrecer
 * los activos al registrar un pago (invariante 5) y para nombrar el origen de
 * los pagos viejos aunque después se haya desactivado.
 */
@Injectable()
export class ListarOrigenesPagoUseCase {
  constructor(private readonly repositorio: OrigenPagoRepository) {}

  execute(): Promise<OrigenPagoCatalogo[]> {
    return this.repositorio.listar();
  }
}
