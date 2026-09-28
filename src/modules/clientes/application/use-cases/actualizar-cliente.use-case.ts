import { Injectable, NotFoundException } from '@nestjs/common';
import { Cliente } from '../../domain/cliente';
import { ClienteRepository } from '../../domain/repositories/cliente.repository';
import { ActualizarClienteDto } from '../dto/actualizar-cliente.dto';

/** `PATCH /clientes/{id}` (Doc 5, Bloque 2). */
@Injectable()
export class ActualizarClienteUseCase {
  constructor(private readonly repositorio: ClienteRepository) {}

  async execute(id: string, dto: ActualizarClienteDto): Promise<Cliente> {
    const cliente = await this.repositorio.buscarPorId(id);
    if (!cliente) {
      throw new NotFoundException('El cliente no existe.');
    }

    // Sin cambios reales no se escribe: `actualizado_en` (@updatedAt) alimenta
    // el delta sync del Doc 5 Bloque 1, y tocarlo sin motivo haría que todos
    // los dispositivos se bajaran de nuevo una fila idéntica.
    if (!cliente.aplicar(dto)) {
      return cliente;
    }

    return this.repositorio.actualizar(cliente);
  }
}
