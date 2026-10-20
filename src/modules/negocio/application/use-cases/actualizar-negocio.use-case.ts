import { Injectable, NotFoundException } from '@nestjs/common';
import { ActualizarNegocioDto } from '../dto/actualizar-negocio.dto';
import { CambiosNegocio, NegocioPropio, NegocioRepository } from '../ports/negocio.repository';

/**
 * `PATCH /negocio` (Doc 5, Bloque 2): el nombre y, desde los recordatorios, el
 * umbral del aviso "Cliente no recoge" (PRD 13, Ajustes). Parcial: un campo
 * omitido no se toca.
 */
@Injectable()
export class ActualizarNegocioUseCase {
  constructor(private readonly repositorio: NegocioRepository) {}

  async execute(negocioId: string, dto: ActualizarNegocioDto): Promise<NegocioPropio> {
    const negocio = await this.repositorio.buscarPorId(negocioId);
    if (!negocio) {
      throw new NotFoundException('El negocio no existe.');
    }

    const cambios: CambiosNegocio = {};

    if ('nombre_negocio' in dto) {
      // Una cadena vacía o de espacios equivale a quitar el nombre: el campo es
      // opcional, así que no hay nada que rechazar (al contrario que el nombre
      // de un Cliente, que sí es obligatorio).
      const nombre = dto.nombre_negocio?.trim() || null;
      if (nombre !== negocio.nombreNegocio) {
        cambios.nombreNegocio = nombre;
      }
    }
    if (
      dto.dias_aviso_no_recoge !== undefined &&
      dto.dias_aviso_no_recoge !== negocio.diasAvisoNoRecoge
    ) {
      cambios.diasAvisoNoRecoge = dto.dias_aviso_no_recoge;
    }

    // Sin cambio real no se escribe: `actualizado_en` lo lee el delta sync.
    if (Object.keys(cambios).length === 0) {
      return negocio;
    }
    return this.repositorio.actualizar(negocioId, cambios);
  }
}
