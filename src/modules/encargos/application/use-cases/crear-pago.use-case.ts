import { Injectable } from '@nestjs/common';
import { hoyEnZonaNegocio } from '../../../../shared/domain/fecha';
import { OrigenPagoInvalidoError } from '../../domain/errores';
import { Pago } from '../../domain/pago';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ResultadoHijo, crearHijo } from '../crear-hijo';
import { CrearPagoDto } from '../dto/crear-pago.dto';

/**
 * `POST /encargos/{id}/pagos` (Doc 5, Bloque 2). Recalcula `saldo_pendiente`.
 *
 * La `fecha` la pone el servidor, nunca el request (Doc 2, invariante 4), con
 * la misma deuda anotada en `CambiarEstadoUseCase`: con la cola Outbox, un
 * pago registrado sin conexión se fechará al sincronizar, no cuando ocurrió.
 * En un módulo de dinero eso importa más que en los demás —afecta a la Caja
 * diaria—, así que es lo primero a resolver al construir el motor de sync.
 */
@Injectable()
export class CrearPagoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  execute(encargoId: string, dto: CrearPagoDto): Promise<ResultadoHijo<Pago>> {
    return crearHijo({
      repositorio: this.repositorio,
      encargoId,
      id: dto.id,
      leer: (hijos, id) => hijos.buscarPago(id),
      escribir: async (hijos) => {
        // Doc 2, invariante 5: el origen debe ser uno de los reconocidos y
        // estar activo. Sin esta comprobación, la FK daría un error de Prisma
        // que acabaría en 500.
        if (!(await hijos.existeOrigenPago(dto.origen_id))) {
          throw new OrigenPagoInvalidoError(dto.origen_id);
        }

        const pago = Pago.crear(
          { id: dto.id, monto: dto.monto, origenId: dto.origen_id, tipo: dto.tipo },
          hoyEnZonaNegocio(),
        );
        return hijos.crearPago(pago);
      },
    });
  }
}
