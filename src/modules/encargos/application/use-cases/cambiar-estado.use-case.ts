import { Injectable, NotFoundException } from '@nestjs/common';
import { hoyEnZonaNegocio } from '../../../../shared/domain/fecha';
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
 * **Deuda conocida — la fecha la pone el servidor, no el dispositivo.** El Doc
 * 2 (reglas 3-4) habla de "la fecha del dispositivo". Hoy se usa el reloj del
 * servidor en la zona del negocio, que coincide mientras haya conexión. Cuando
 * exista la cola Outbox (Doc 3), una transición hecha el lunes sin conexión y
 * sincronizada el miércoles quedaría fechada el miércoles. Al implementar el
 * motor de sincronización habrá que decidir si el cuerpo acepta la fecha del
 * dispositivo — lo que choca con el invariante 8 ("nunca editable") — o si se
 * asume ese desfase.
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
    const advertencias = encargo.transicionarA(dto.estado, hoyEnZonaNegocio());

    // Repetir el mismo estado no cambia nada y no debe mover `actualizado_en`,
    // que es lo que lee el delta sync.
    if (anterior === dto.estado) {
      return { encargo, advertencias };
    }

    return { encargo: await this.repositorio.actualizar(encargo), advertencias };
  }
}
