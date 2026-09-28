import { Injectable } from '@nestjs/common';
import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { ServicioRepository } from '../../domain/repositories/servicio.repository';
import { Servicio } from '../../domain/servicio';
import { ListarServiciosQuery } from '../dto/listar-servicios.query';

/** `GET /servicios?incluir_inactivos=` (Doc 5, Bloques 2 y 4). */
@Injectable()
export class ListarServiciosUseCase {
  constructor(private readonly repositorio: ServicioRepository) {}

  execute(query: ListarServiciosQuery): Promise<PaginaResultado<Servicio>> {
    return this.repositorio.listar({
      incluirInactivos: query.incluir_inactivos,
      pagina: query.pagina,
      porPagina: query.por_pagina,
    });
  }
}
