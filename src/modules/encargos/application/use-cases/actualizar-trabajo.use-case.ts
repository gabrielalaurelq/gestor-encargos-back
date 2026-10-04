import { Injectable, NotFoundException } from '@nestjs/common';
import { Encargo } from '../../domain/encargo';
import { ObjetoNoEnEncargoError } from '../../domain/errores';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { CambiosTrabajo, Trabajo } from '../../domain/trabajo';
import { ActualizarTrabajoDto } from '../dto/crear-trabajo.dto';

/**
 * `PATCH /encargos/{id}/trabajos/{trabajoId}` (Doc 5, Bloque 2).
 *
 * Si el trabajo vino del catálogo, tocar el precio da `422
 * TRABAJO_PRECIO_BLOQUEADO` (Doc 2, invariante 13). La comprobación vive en la
 * entidad, no acá: así vale para cualquier camino que intente editarlo.
 */
@Injectable()
export class ActualizarTrabajoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(
    encargoId: string,
    trabajoId: string,
    dto: ActualizarTrabajoDto,
  ): Promise<{ trabajo: Trabajo; encargo: Encargo }> {
    const mutacion = await this.repositorio.mutarAgregado(encargoId, async (hijos) => {
      const trabajo = await hijos.buscarTrabajo(trabajoId);
      if (!trabajo) {
        throw new NotFoundException('El trabajo no existe en este encargo.');
      }

      const cambios = ActualizarTrabajoUseCase.aDominio(dto);
      if (cambios.objetoRecibidoId !== undefined && cambios.objetoRecibidoId !== null) {
        if (!(await hijos.buscarObjeto(cambios.objetoRecibidoId))) {
          throw new ObjetoNoEnEncargoError(cambios.objetoRecibidoId);
        }
      }

      return trabajo.aplicar(cambios) ? hijos.actualizarTrabajo(trabajo) : trabajo;
    });

    if (!mutacion) {
      throw new NotFoundException('El encargo no existe.');
    }
    return { trabajo: mutacion.resultado, encargo: mutacion.encargo };
  }

  private static aDominio(dto: ActualizarTrabajoDto): CambiosTrabajo {
    const cambios: CambiosTrabajo = {};
    if ('descripcion' in dto) cambios.descripcion = dto.descripcion;
    if ('precio' in dto) cambios.precio = dto.precio;
    if ('objeto_recibido_id' in dto) cambios.objetoRecibidoId = dto.objeto_recibido_id;
    return cambios;
  }
}
