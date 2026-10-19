import { Injectable } from '@nestjs/common';
import { resolverFechaDeHecho } from '../../../../shared/domain/fecha';
import { OrigenPagoInvalidoError } from '../../domain/errores';
import { Pago } from '../../domain/pago';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ResultadoHijo, crearHijo } from '../crear-hijo';
import { CrearPagoDto } from '../dto/crear-pago.dto';

/**
 * `POST /encargos/{id}/pagos` (Doc 5, Bloque 2). Recalcula `saldo_pendiente`.
 *
 * La `fecha` la pone el reloj del **dispositivo** (Doc 2, invariante 4: "la
 * fecha del dispositivo al momento del registro"); si el cuerpo no la trae, se
 * usa la del servidor. Es lo que hace correcta la cola Outbox: un pago
 * registrado sin conexión el lunes y sincronizado el miércoles queda fechado
 * el lunes, que es lo que necesita la Caja diaria (PRD módulo 12) para
 * agrupar bien. El usuario nunca la teclea, así que sigue siendo automática y
 * no editable.
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
          resolverFechaDeHecho(dto.fecha, 'fecha del pago'),
        );
        return hijos.crearPago(pago);
      },
    });
  }
}
