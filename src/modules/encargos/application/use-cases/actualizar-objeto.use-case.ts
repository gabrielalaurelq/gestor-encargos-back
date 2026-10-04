import { Injectable, NotFoundException } from '@nestjs/common';
import { Encargo } from '../../domain/encargo';
import { ObjetoRecibido } from '../../domain/objeto-recibido';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ActualizarObjetoDto } from '../dto/crear-objeto.dto';

/** `PATCH /encargos/{id}/objetos/{objetoId}` (Doc 5, Bloque 2). */
@Injectable()
export class ActualizarObjetoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(
    encargoId: string,
    objetoId: string,
    dto: ActualizarObjetoDto,
  ): Promise<{ objeto: ObjetoRecibido; encargo: Encargo }> {
    const mutacion = await this.repositorio.mutarAgregado(encargoId, async (hijos) => {
      const objeto = await hijos.buscarObjeto(objetoId);
      if (!objeto) {
        throw new NotFoundException('El objeto no existe en este encargo.');
      }

      // Sin cambios reales no se escribe: `actualizado_en` alimenta el delta sync.
      return objeto.aplicar(dto) ? hijos.actualizarObjeto(objeto) : objeto;
    });

    if (!mutacion) {
      throw new NotFoundException('El encargo no existe.');
    }
    return { objeto: mutacion.resultado, encargo: mutacion.encargo };
  }
}
