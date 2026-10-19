import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginacionQuery } from '../../../../shared/application/dto/paginacion.query';
import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { ClienteRepository } from '../../../clientes/domain/repositories/cliente.repository';
import { Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `GET /clientes/{id}/encargos` (Doc 5, Bloque 2): historial completo del
 * cliente (PRD módulo 1), paginado como el resto de listados (Doc 5 Bloque 4).
 *
 * Se distingue "cliente inexistente" (404) de "cliente sin encargos" (lista
 * vacía): con solo el filtro `cliente_id` de `GET /encargos` los dos casos se
 * verían iguales, y la app no podría saber que el cliente ya no existe. Un
 * cliente de otro negocio cae en el 404 por el filtro de `PrismaNegocio`.
 */
@Injectable()
export class ListarEncargosDeClienteUseCase {
  constructor(
    private readonly encargos: EncargoRepository,
    private readonly clientes: ClienteRepository,
  ) {}

  async execute(clienteId: string, query: PaginacionQuery): Promise<PaginaResultado<Encargo>> {
    if (!(await this.clientes.buscarPorId(clienteId))) {
      throw new NotFoundException('El cliente no existe.');
    }
    return this.encargos.listar({
      clienteId,
      orden: 'recientes',
      pagina: query.pagina,
      porPagina: query.por_pagina,
    });
  }
}
