import { Injectable } from '@nestjs/common';
import { crearIdempotente } from '../../../../shared/application/crear-idempotente';
import { ServicioRepository } from '../../domain/repositories/servicio.repository';
import { Servicio } from '../../domain/servicio';
import { CrearServicioDto } from '../dto/crear-servicio.dto';

export interface ResultadoCrearServicio {
  servicio: Servicio;
  /** `false` cuando el id ya existía: la respuesta es 200, no 201. */
  creado: boolean;
}

/** `POST /servicios` (Doc 5, Bloque 2). Idempotente: ver `crearIdempotente`. */
@Injectable()
export class CrearServicioUseCase {
  constructor(private readonly repositorio: ServicioRepository) {}

  async execute(dto: CrearServicioDto): Promise<ResultadoCrearServicio> {
    const { recurso, creado } = await crearIdempotente({
      id: dto.id,
      buscar: (id) => this.repositorio.buscarPorId(id),
      crear: () => this.repositorio.crear(Servicio.crear(dto)),
    });

    return { servicio: recurso, creado };
  }
}
