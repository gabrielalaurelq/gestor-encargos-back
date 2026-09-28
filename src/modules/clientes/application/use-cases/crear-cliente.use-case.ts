import { Injectable } from '@nestjs/common';
import { crearIdempotente } from '../../../../shared/application/crear-idempotente';
import { Cliente } from '../../domain/cliente';
import { ClienteRepository } from '../../domain/repositories/cliente.repository';
import { CrearClienteDto } from '../dto/crear-cliente.dto';

export interface ResultadoCrearCliente {
  cliente: Cliente;
  /** `false` cuando el id ya existía: la respuesta es 200, no 201. */
  creado: boolean;
}

/** `POST /clientes` (Doc 5, Bloque 2). Idempotente: ver `crearIdempotente`. */
@Injectable()
export class CrearClienteUseCase {
  constructor(private readonly repositorio: ClienteRepository) {}

  async execute(dto: CrearClienteDto): Promise<ResultadoCrearCliente> {
    const { recurso, creado } = await crearIdempotente({
      id: dto.id,
      buscar: (id) => this.repositorio.buscarPorId(id),
      // Se valida antes de tocar la base: si el nombre o el teléfono no
      // cumplen, el 422 sale sin haber abierto transacción.
      crear: () => this.repositorio.crear(Cliente.crear(dto)),
    });

    return { cliente: recurso, creado };
  }
}
