import { Injectable, NotFoundException } from '@nestjs/common';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `DELETE /encargos/{id}/fotos/{fotoId}` (Doc 5 Bloque 2) — soft delete. **No
 * borra el archivo en R2**: otro dispositivo offline todavía no se enteró del
 * borrado, y el tombstone tiene que propagarse primero. El archivo lo borra
 * `PurgaSoftDeleteJob` junto con la fila, pasado el horizonte de retención.
 */
@Injectable()
export class EliminarFotoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(encargoId: string, fotoId: string): Promise<void> {
    const mutacion = await this.repositorio.mutarAgregado(encargoId, async (hijos) => {
      if (!(await hijos.eliminarFoto(fotoId))) {
        throw new NotFoundException('La foto no existe en este encargo.');
      }
    });

    if (!mutacion) {
      throw new NotFoundException('El encargo no existe.');
    }
  }
}
