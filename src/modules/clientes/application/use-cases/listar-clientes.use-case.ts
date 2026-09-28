import { Injectable } from '@nestjs/common';
import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { Cliente } from '../../domain/cliente';
import { ClienteRepository } from '../../domain/repositories/cliente.repository';
import { ListarClientesQuery } from '../dto/listar-clientes.query';

/** `GET /clientes?q=&pagina=&por_pagina=` (Doc 5, Bloques 2 y 4). */
@Injectable()
export class ListarClientesUseCase {
  constructor(private readonly repositorio: ClienteRepository) {}

  execute(query: ListarClientesQuery): Promise<PaginaResultado<Cliente>> {
    return this.repositorio.listar({
      q: query.q?.trim() || undefined,
      pagina: query.pagina,
      porPagina: query.por_pagina,
    });
  }
}
