import { Injectable, NotFoundException } from '@nestjs/common';
import { resolverFechaDeHecho } from '../../../../shared/domain/fecha';
import { AdvertenciaEncargo, Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { CambiarEstadoDto } from '../dto/cambiar-estado.dto';

export interface ResultadoCambiarEstado {
  encargo: Encargo;
  /** No bloquean: la operación ya se aplicó (Doc 2, invariante 10). */
  advertencias: AdvertenciaEncargo[];
}

/**
 * `PATCH /encargos/{id}/estado` (Doc 5, Bloque 2).
 *
 * `fecha_listo` y `fecha_entrega_real` las fija el reloj del **dispositivo**
 * (Doc 2, reglas 3-4: "fecha del dispositivo"); si el cuerpo no trae `fecha`,
 * se usa la del servidor. El invariante 8 —"nunca editables manualmente"— se
 * respeta igual: dice que el usuario no puede teclearlas, no que el reloj deba
 * vivir en el servidor. La app las calcula sola y la UI no las expone.
 */
@Injectable()
export class CambiarEstadoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(id: string, dto: CambiarEstadoDto): Promise<ResultadoCambiarEstado> {
    const encargo = await this.repositorio.buscarPorId(id);
    if (!encargo) {
      throw new NotFoundException('El encargo no existe.');
    }

    // Se guarda antes: `transicionarA` muta el estado, así que después ya no
    // se podría distinguir una transición real de repetir el estado actual.
    const anterior = encargo.estado;
    const advertencias = encargo.transicionarA(
      dto.estado,
      resolverFechaDeHecho(dto.fecha, 'fecha del cambio de estado'),
    );

    // Repetir el mismo estado no cambia nada y no debe mover `actualizado_en`,
    // que es lo que lee el delta sync.
    if (anterior === dto.estado) {
      return { encargo, advertencias };
    }

    return { encargo: await this.repositorio.actualizar(encargo), advertencias };
  }
}
