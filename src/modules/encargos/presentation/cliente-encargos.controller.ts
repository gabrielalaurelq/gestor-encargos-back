import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaginacionQuery } from '../../../shared/application/dto/paginacion.query';
import { RespuestaPaginadaDto, respuestaPaginada } from '../../../shared/presentation/paginacion';
import { ListarEncargosDeClienteUseCase } from '../application/use-cases/listar-encargos-de-cliente.use-case';
import { aEncargoResponse } from './encargo.response';

// Doc 5, Bloque 2: `GET /clientes/{id}/encargos`. La ruta cuelga de
// `/clientes` pero el controller vive acá: lo que devuelve son encargos, y
// `EncargosModule` ya depende de `ClientesModule` (al revés sería circular).
@ApiTags('clientes')
@ApiBearerAuth()
@Controller('clientes')
export class ClienteEncargosController {
  constructor(private readonly listar: ListarEncargosDeClienteUseCase) {}

  @Get(':id/encargos')
  @ApiOperation({
    summary: 'Historial completo de encargos de un cliente.',
    description: 'Todos los estados, del más reciente al más antiguo (por `creado_en`).',
  })
  @ApiOkResponse({ type: RespuestaPaginadaDto })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO — no existe o es de otro negocio.' })
  async listarEncargosDeCliente(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginacionQuery,
  ) {
    const pagina = await this.listar.execute(id, query);
    return respuestaPaginada(
      { datos: pagina.datos.map(aEncargoResponse), total: pagina.total },
      query.pagina,
      query.por_pagina,
    );
  }
}
