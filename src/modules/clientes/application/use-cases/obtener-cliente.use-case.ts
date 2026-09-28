import { Injectable, NotFoundException } from '@nestjs/common';
import { Cliente } from '../../domain/cliente';
import { ClienteRepository } from '../../domain/repositories/cliente.repository';

/**
 * `GET /clientes/{id}` (Doc 5, Bloque 2).
 *
 * Un id de otro negocio también termina en 404, sin que haya que comprobarlo:
 * el filtro de `PrismaNegocio` y RLS hacen que la fila simplemente no exista
 * para esta sesión. Es exactamente lo que pide el Doc 5 Bloque 3 — nunca 403,
 * porque "prohibido" confirmaría que el recurso existe en otro tenant.
 *
 * Pendiente de Sprint 2: el Doc 5 dice que esta ficha "incluye resumen de
 * Historial (módulo 18)". Ese bloque se agrega cuando exista el módulo
 * Encargos; hoy no hay de dónde calcularlo.
 */
@Injectable()
export class ObtenerClienteUseCase {
  constructor(private readonly repositorio: ClienteRepository) {}

  async execute(id: string): Promise<Cliente> {
    const cliente = await this.repositorio.buscarPorId(id);
    if (!cliente) {
      throw new NotFoundException('El cliente no existe.');
    }
    return cliente;
  }
}
