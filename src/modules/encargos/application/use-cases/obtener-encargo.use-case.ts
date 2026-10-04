import { Injectable, NotFoundException } from '@nestjs/common';
import { Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `GET /encargos/{id}` (Doc 5, Bloque 2).
 *
 * El Doc 5 promete "detalle completo (con objetos, trabajos, pagos, notas,
 * fotos anidados)". Esos hijos llegan en Sprint 3-4; hasta entonces la
 * respuesta trae solo el encargo. Se prefiere omitir las claves antes que
 * devolver arreglos vacíos que hoy serían siempre vacíos por construcción.
 */
@Injectable()
export class ObtenerEncargoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(id: string): Promise<Encargo> {
    const encargo = await this.repositorio.buscarPorId(id);
    if (!encargo) {
      throw new NotFoundException('El encargo no existe.');
    }
    return encargo;
  }
}
