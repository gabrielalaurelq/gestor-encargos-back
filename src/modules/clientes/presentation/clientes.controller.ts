import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { RespuestaPaginadaDto, respuestaPaginada } from '../../../shared/presentation/paginacion';
import { ActualizarClienteDto } from '../application/dto/actualizar-cliente.dto';
import { CrearClienteDto } from '../application/dto/crear-cliente.dto';
import { ListarClientesQuery } from '../application/dto/listar-clientes.query';
import { ActualizarClienteUseCase } from '../application/use-cases/actualizar-cliente.use-case';
import { CrearClienteUseCase } from '../application/use-cases/crear-cliente.use-case';
import { ListarClientesUseCase } from '../application/use-cases/listar-clientes.use-case';
import { ObtenerClienteUseCase } from '../application/use-cases/obtener-cliente.use-case';
import {
  ClienteDetalleResponse,
  ClienteResponse,
  aClienteDetalleResponse,
  aClienteResponse,
} from './cliente.response';

// Doc 5, Bloque 2 — agregado Cliente. Todas las rutas exigen sesión: el
// AuthGuard global las protege sin `@Public()`, y `PrismaNegocio` las ata al
// negocio de esa sesión.
//
// `GET /clientes/{id}/encargos` vive en el módulo Encargos
// (`ClienteEncargosController`): lista encargos, y `EncargosModule` ya importa
// `ClientesModule` — declararla acá crearía una dependencia circular.
@ApiTags('clientes')
@ApiBearerAuth()
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly listar: ListarClientesUseCase,
    private readonly crear: CrearClienteUseCase,
    private readonly obtener: ObtenerClienteUseCase,
    private readonly actualizar: ActualizarClienteUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista o busca clientes por nombre parcial o teléfono.' })
  @ApiOkResponse({ type: RespuestaPaginadaDto })
  async listarClientes(@Query() query: ListarClientesQuery) {
    const pagina = await this.listar.execute(query);
    return respuestaPaginada(
      { datos: pagina.datos.map(aClienteResponse), total: pagina.total },
      query.pagina,
      query.por_pagina,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un cliente.',
    description:
      'Idempotente respecto del `id` enviado por el dispositivo: si ese id ya existe en el ' +
      'negocio, responde 200 con el cliente existente en lugar de 201, para que el reintento ' +
      'de la cola Outbox (Doc 5 Bloque 1) no duplique.',
  })
  @ApiCreatedResponse({ type: ClienteResponse, description: 'Cliente creado.' })
  @ApiOkResponse({ type: ClienteResponse, description: 'El id ya existía; se devuelve el actual.' })
  @ApiResponse({ status: 422, description: 'CLIENTE_NOMBRE_VACIO | TELEFONO_INVALIDO' })
  async crearCliente(
    @Body() dto: CrearClienteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClienteResponse> {
    const { cliente, creado } = await this.crear.execute(dto);
    res.status(creado ? 201 : 200);
    return aClienteResponse(cliente);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ficha de un cliente, con el resumen de Historial (PRD módulo 18).',
  })
  @ApiOkResponse({ type: ClienteDetalleResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO — no existe o es de otro negocio.' })
  async obtenerCliente(@Param('id', ParseUUIDPipe) id: string): Promise<ClienteDetalleResponse> {
    return aClienteDetalleResponse(await this.obtener.execute(id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita un cliente.',
    description: 'Parcial: omitir un campo lo deja igual; `"telefono": null` borra el teléfono.',
  })
  @ApiOkResponse({ type: ClienteResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO' })
  @ApiResponse({ status: 422, description: 'CLIENTE_NOMBRE_VACIO | TELEFONO_INVALIDO' })
  async actualizarCliente(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarClienteDto,
  ): Promise<ClienteResponse> {
    return aClienteResponse(await this.actualizar.execute(id, dto));
  }
}
