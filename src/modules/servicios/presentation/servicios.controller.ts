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
import { ActualizarServicioDto } from '../application/dto/actualizar-servicio.dto';
import { CrearServicioDto } from '../application/dto/crear-servicio.dto';
import { ListarServiciosQuery } from '../application/dto/listar-servicios.query';
import { ActualizarServicioUseCase } from '../application/use-cases/actualizar-servicio.use-case';
import { CrearServicioUseCase } from '../application/use-cases/crear-servicio.use-case';
import { ListarServiciosUseCase } from '../application/use-cases/listar-servicios.use-case';
import { ServicioResponse, aServicioResponse } from './servicio.response';

// Doc 5, Bloque 2 — Catálogo de servicios. Sin DELETE a propósito: un
// Servicio nunca se elimina, solo se desactiva (Doc 2, invariante 14).
@ApiTags('servicios')
@ApiBearerAuth()
@Controller('servicios')
export class ServiciosController {
  constructor(
    private readonly listar: ListarServiciosUseCase,
    private readonly crear: CrearServicioUseCase,
    private readonly actualizar: ActualizarServicioUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista el catálogo; por defecto solo los servicios activos.' })
  @ApiOkResponse({ type: RespuestaPaginadaDto })
  async listarServicios(@Query() query: ListarServiciosQuery) {
    const pagina = await this.listar.execute(query);
    return respuestaPaginada(
      { datos: pagina.datos.map(aServicioResponse), total: pagina.total },
      query.pagina,
      query.por_pagina,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Agrega un servicio al catálogo.',
    description:
      'Idempotente respecto del `id` enviado por el dispositivo: si ese id ya existe en el ' +
      'negocio, responde 200 con el existente en lugar de 201. Se permiten nombres repetidos ' +
      '(PRD módulo 4: el MVP no bloquea duplicados).',
  })
  @ApiCreatedResponse({ type: ServicioResponse, description: 'Servicio creado.' })
  @ApiOkResponse({
    type: ServicioResponse,
    description: 'El id ya existía; se devuelve el actual.',
  })
  @ApiResponse({ status: 422, description: 'SERVICIO_NOMBRE_VACIO | SERVICIO_PRECIO_INVALIDO' })
  async crearServicio(
    @Body() dto: CrearServicioDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServicioResponse> {
    const { servicio, creado } = await this.crear.execute(dto);
    res.status(creado ? 201 : 200);
    return aServicioResponse(servicio);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita el precio o desactiva un servicio.',
    description:
      'El cambio de precio rige solo para los Trabajos que se creen desde ahora: los ya ' +
      'creados copiaron su precio y no se alteran (Doc 2, invariante 12). El nombre no es ' +
      'editable — para corregirlo, desactivar y crear otro.',
  })
  @ApiOkResponse({ type: ServicioResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO — no existe o es de otro negocio.' })
  @ApiResponse({ status: 422, description: 'SERVICIO_PRECIO_INVALIDO | MONTO_INVALIDO' })
  async actualizarServicio(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarServicioDto,
  ): Promise<ServicioResponse> {
    return aServicioResponse(await this.actualizar.execute(id, dto));
  }
}
