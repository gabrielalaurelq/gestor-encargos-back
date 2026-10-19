import { Injectable, NotFoundException } from '@nestjs/common';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `DELETE /encargos/{id}/trabajos/{trabajoId}/materiales/{materialId}` (Doc 5,
 * Bloque 2) — soft delete, para que el delta sync propague el borrado (Doc 4,
 * Bloque 3). No devuelve nada: un material no mueve ningún derivado del
 * encargo, así que no hay qué refrescar.
 *
 * Un material de un trabajo ya borrado da 404: se borró con él (cascada).
 */
@Injectable()
export class EliminarMaterialUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(encargoId: string, trabajoId: string, materialId: string): Promise<void> {
    const mutacion = await this.repositorio.mutarAgregado(encargoId, async (hijos) => {
      if (!(await hijos.eliminarMaterial(trabajoId, materialId))) {
        throw new NotFoundException('El material no existe en este trabajo.');
      }
    });

    if (!mutacion) {
      throw new NotFoundException('El encargo no existe.');
    }
  }
}
