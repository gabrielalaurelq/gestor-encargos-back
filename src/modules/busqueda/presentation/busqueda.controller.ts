import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ClienteResponse, aClienteResponse } from '../../clientes/presentation/cliente.response';
import { EncargoResponse, aEncargoResponse } from '../../encargos/presentation/encargo.response';
import { BuscarUseCase, RESULTADOS_POR_GRUPO } from '../application/buscar.use-case';
import { BuscarQuery } from '../application/dto/buscar.query';

// Mismas formas que `GET /clientes` y `GET /encargos`, a propósito: tocar un
// resultado abre su detalle (PRD 16), y la app no debería tener que conocer
// una tercera representación de cada recurso.
export class BusquedaResponse {
  @ApiProperty({ isArray: true, type: ClienteResponse })
  clientes!: ClienteResponse[];

  @ApiProperty({ isArray: true, type: EncargoResponse, description: 'Más recientes primero.' })
  encargos!: EncargoResponse[];
}

// Doc 5, Bloque 4 — Búsqueda global (PRD módulo 16).
@ApiTags('busqueda')
@ApiBearerAuth()
@Controller('buscar')
export class BusquedaController {
  constructor(private readonly buscar: BuscarUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Busca a la vez en clientes y encargos.',
    description:
      'Clientes por nombre o teléfono; encargos por descripción o ubicación física, en ' +
      `cualquier estado. Hasta ${RESULTADOS_POR_GRUPO} resultados por grupo. Sin coincidencias ` +
      'devuelve los dos grupos vacíos, no un error.',
  })
  @ApiOkResponse({ type: BusquedaResponse })
  @ApiResponse({ status: 400, description: 'SOLICITUD_INVALIDA — `q` ausente o vacío.' })
  async buscarGlobal(@Query() query: BuscarQuery): Promise<BusquedaResponse> {
    const { clientes, encargos } = await this.buscar.execute(query.q);
    return {
      clientes: clientes.map(aClienteResponse),
      encargos: encargos.map(aEncargoResponse),
    };
  }
}
