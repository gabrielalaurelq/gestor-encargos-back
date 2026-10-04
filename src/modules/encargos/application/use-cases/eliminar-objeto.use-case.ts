import { Injectable, NotFoundException } from '@nestjs/common';
import { Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `DELETE /encargos/{id}/objetos/{objetoId}` (Doc 5, Bloque 2) — soft delete.
 *
 * No borra los Trabajos vinculados: la FK es `ON DELETE SET NULL` y el
 * invariante 19 dice que un Trabajo puede existir sin objeto. Borrar el objeto
 * no borra el trabajo ni su precio, así que `precio_total` no cambia.
 */
@Injectable()
export class EliminarObjetoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(encargoId: string, objetoId: string): Promise<Encargo> {
    const mutacion = await this.repositorio.mutarAgregado(encargoId, async (hijos) => {
      if (!(await hijos.eliminarObjeto(objetoId))) {
        throw new NotFoundException('El objeto no existe en este encargo.');
      }
    });

    if (!mutacion) {
      throw new NotFoundException('El encargo no existe.');
    }
    return mutacion.encargo;
  }
}
