import { Injectable, NotFoundException } from '@nestjs/common';
import { ServicioRepository } from '../../domain/repositories/servicio.repository';
import { Servicio } from '../../domain/servicio';
import { ActualizarServicioDto } from '../dto/actualizar-servicio.dto';

/**
 * `PATCH /servicios/{id}` (Doc 5, Bloque 2): precio o `activo`.
 *
 * Editar el precio no toca ningún Trabajo ya creado (Doc 2, invariante 12).
 * No hay nada que propagar: el Trabajo copia el precio al crearse, así que la
 * no retroactividad se cumple por construcción, no por una regla acá.
 */
@Injectable()
export class ActualizarServicioUseCase {
  constructor(private readonly repositorio: ServicioRepository) {}

  async execute(id: string, dto: ActualizarServicioDto): Promise<Servicio> {
    const servicio = await this.repositorio.buscarPorId(id);
    if (!servicio) {
      throw new NotFoundException('El servicio no existe.');
    }

    // Sin cambios reales no se escribe: `actualizado_en` alimenta el delta
    // sync del Doc 5 Bloque 1.
    if (!servicio.aplicar(dto)) {
      return servicio;
    }

    return this.repositorio.actualizar(servicio);
  }
}
