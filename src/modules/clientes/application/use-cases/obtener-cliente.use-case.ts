import { Injectable, NotFoundException } from '@nestjs/common';
import { Cliente } from '../../domain/cliente';
import { ClienteRepository } from '../../domain/repositories/cliente.repository';
import { HistorialCliente, HistorialClienteConsulta } from '../ports/historial-cliente.consulta';

export interface FichaCliente {
  cliente: Cliente;
  historial: HistorialCliente;
}

/**
 * `GET /clientes/{id}` (Doc 5, Bloque 2): la ficha, que "incluye resumen de
 * Historial (módulo 18)".
 *
 * Un id de otro negocio también termina en 404, sin que haya que comprobarlo:
 * el filtro de `PrismaNegocio` y RLS hacen que la fila simplemente no exista
 * para esta sesión. Es exactamente lo que pide el Doc 5 Bloque 3 — nunca 403,
 * porque "prohibido" confirmaría que el recurso existe en otro tenant.
 */
@Injectable()
export class ObtenerClienteUseCase {
  constructor(
    private readonly repositorio: ClienteRepository,
    private readonly historial: HistorialClienteConsulta,
  ) {}

  async execute(id: string): Promise<FichaCliente> {
    const cliente = await this.repositorio.buscarPorId(id);
    if (!cliente) {
      throw new NotFoundException('El cliente no existe.');
    }
    return { cliente, historial: await this.historial.obtener(id) };
  }
}
