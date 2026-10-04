import { Injectable } from '@nestjs/common';
import { ObjetoRecibido } from '../../domain/objeto-recibido';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ResultadoHijo, crearHijo } from '../crear-hijo';
import { CrearObjetoDto } from '../dto/crear-objeto.dto';

/** `POST /encargos/{id}/objetos` (Doc 5, Bloque 2). */
@Injectable()
export class CrearObjetoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  execute(encargoId: string, dto: CrearObjetoDto): Promise<ResultadoHijo<ObjetoRecibido>> {
    return crearHijo({
      repositorio: this.repositorio,
      encargoId,
      id: dto.id,
      leer: (hijos, id) => hijos.buscarObjeto(id),
      escribir: (hijos) => hijos.crearObjeto(ObjetoRecibido.crear(dto)),
    });
  }
}
