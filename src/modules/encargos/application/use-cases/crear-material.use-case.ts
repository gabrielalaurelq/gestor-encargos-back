import { Injectable, NotFoundException } from '@nestjs/common';
import { Material } from '../../domain/material';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ResultadoHijo, crearHijo } from '../crear-hijo';
import { CrearMaterialDto } from '../dto/crear-material.dto';

/**
 * `POST /encargos/{id}/trabajos/{trabajoId}/materiales` (Doc 5, Bloque 2).
 *
 * Pasa por el agregado como cualquier hijo (Doc 2, regla de consistencia),
 * aunque no mueva ningún derivado: es la transacción del encargo la que
 * garantiza que el trabajo sigue vivo en el momento de escribir. Se admite en
 * cualquier momento —incluso días después de crear el trabajo, Caso 4— y en
 * cualquier estado del encargo: el PRD no pone límite.
 */
@Injectable()
export class CrearMaterialUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  execute(
    encargoId: string,
    trabajoId: string,
    dto: CrearMaterialDto,
  ): Promise<ResultadoHijo<Material>> {
    return crearHijo({
      repositorio: this.repositorio,
      encargoId,
      id: dto.id,
      leer: (hijos, id) => hijos.buscarMaterial(trabajoId, id),
      escribir: async (hijos) => {
        // Un trabajo borrado no existe para el dominio: sin esta comprobación,
        // la FK aceptaría colgar un material vivo de un tombstone.
        if (!(await hijos.buscarTrabajo(trabajoId))) {
          throw new NotFoundException('El trabajo no existe en este encargo.');
        }
        return hijos.crearMaterial(Material.crear(trabajoId, dto));
      },
    });
  }
}
