import { Injectable } from '@nestjs/common';
import { fechaDesdeIso } from '../../../../shared/domain/fecha';
import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ListarEncargosQuery } from '../dto/listar-encargos.query';

/** `GET /encargos?estado=&fecha_desde=&fecha_hasta=&cliente_id=` (Doc 5, Bloque 2). */
@Injectable()
export class ListarEncargosUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  execute(query: ListarEncargosQuery): Promise<PaginaResultado<Encargo>> {
    return this.repositorio.listar({
      estado: query.estado,
      fechaDesde: query.fecha_desde ? fechaDesdeIso(query.fecha_desde, 'desde') : undefined,
      fechaHasta: query.fecha_hasta ? fechaDesdeIso(query.fecha_hasta, 'hasta') : undefined,
      clienteId: query.cliente_id,
      pagina: query.pagina,
      porPagina: query.por_pagina,
    });
  }
}
