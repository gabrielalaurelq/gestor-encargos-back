import { Injectable, NotFoundException } from '@nestjs/common';
import { ActualizarNegocioDto } from '../dto/actualizar-negocio.dto';
import { NegocioPropio, NegocioRepository } from '../ports/negocio.repository';

/** `PATCH /negocio` (Doc 5, Bloque 2). */
@Injectable()
export class ActualizarNegocioUseCase {
  constructor(private readonly repositorio: NegocioRepository) {}

  async execute(negocioId: string, dto: ActualizarNegocioDto): Promise<NegocioPropio> {
    const negocio = await this.repositorio.buscarPorId(negocioId);
    if (!negocio) {
      throw new NotFoundException('El negocio no existe.');
    }

    if (!('nombre_negocio' in dto)) {
      return negocio;
    }

    // Una cadena vacía o de espacios equivale a quitar el nombre: el campo es
    // opcional, así que no hay nada que rechazar (al contrario que el nombre
    // de un Cliente, que sí es obligatorio).
    const nombre = dto.nombre_negocio?.trim() || null;

    // Sin cambio real no se escribe: `actualizado_en` lo lee el delta sync.
    if (nombre === negocio.nombreNegocio) {
      return negocio;
    }

    return this.repositorio.actualizarNombre(negocioId, nombre);
  }
}
