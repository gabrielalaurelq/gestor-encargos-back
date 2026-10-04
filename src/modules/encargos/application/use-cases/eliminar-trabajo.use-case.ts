import { Injectable, NotFoundException } from '@nestjs/common';
import { Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `DELETE /encargos/{id}/trabajos/{trabajoId}` (Doc 5, Bloque 2) — soft delete
 * que recalcula `precio_total`.
 *
 * Es el caso que ejercita la segunda mitad del invariante 2: si al quitar este
 * trabajo la suma queda por debajo del descuento vigente, el descuento **se
 * ajusta solo** dentro de la misma transacción (lo hace `Encargo.recalcular`).
 * No se bloquea: el usuario no pidió ese cambio de descuento, lo provocó
 * borrar el trabajo, y bloquearlo dejaría el encargo imposible de arreglar.
 */
@Injectable()
export class EliminarTrabajoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(encargoId: string, trabajoId: string): Promise<Encargo> {
    const mutacion = await this.repositorio.mutarAgregado(encargoId, async (hijos) => {
      if (!(await hijos.eliminarTrabajo(trabajoId))) {
        throw new NotFoundException('El trabajo no existe en este encargo.');
      }
    });

    if (!mutacion) {
      throw new NotFoundException('El encargo no existe.');
    }
    return mutacion.encargo;
  }
}
