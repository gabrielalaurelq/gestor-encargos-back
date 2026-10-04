import { Injectable } from '@nestjs/common';
import { hoyEnZonaNegocio } from '../../../../shared/domain/fecha';
import { Nota } from '../../domain/nota';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ResultadoHijo, crearHijo } from '../crear-hijo';
import { CrearNotaDto } from '../dto/crear-nota.dto';

/**
 * `POST /encargos/{id}/notas` (Doc 5, Bloque 2). Único endpoint de Notas: una
 * nota es inmutable (Doc 2, invariante 16), así que no hay `PATCH` ni `DELETE`.
 * No afecta a ningún campo calculado del encargo.
 */
@Injectable()
export class CrearNotaUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  execute(encargoId: string, dto: CrearNotaDto): Promise<ResultadoHijo<Nota>> {
    return crearHijo({
      repositorio: this.repositorio,
      encargoId,
      id: dto.id,
      leer: (hijos, id) => hijos.buscarNota(id),
      escribir: (hijos) => hijos.crearNota(Nota.crear(dto, hoyEnZonaNegocio())),
    });
  }
}
