import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { SesionActual } from '../../../shared/presentation/auth/sesion-actual.decorator';
import { SesionAutenticada } from '../../../shared/presentation/auth/sesion-autenticada';
import { RespuestaPaginadaDto, respuestaPaginada } from '../../../shared/presentation/paginacion';
import { ActualizarEncargoDto } from '../application/dto/actualizar-encargo.dto';
import { CambiarEstadoDto } from '../application/dto/cambiar-estado.dto';
import { CrearEncargoDto } from '../application/dto/crear-encargo.dto';
import { ListarEncargosQuery } from '../application/dto/listar-encargos.query';
import { ActualizarEncargoUseCase } from '../application/use-cases/actualizar-encargo.use-case';
import { CambiarEstadoUseCase } from '../application/use-cases/cambiar-estado.use-case';
import { CrearEncargoUseCase } from '../application/use-cases/crear-encargo.use-case';
import { ListarEncargosUseCase } from '../application/use-cases/listar-encargos.use-case';
import { ObtenerEncargoUseCase } from '../application/use-cases/obtener-encargo.use-case';
import { ReservarBloqueNumerosUseCase } from '../application/use-cases/reservar-bloque-numeros.use-case';
import {
  BloqueNumerosResponse,
  EncargoConAdvertenciasResponse,
  EncargoResponse,
  aEncargoResponse,
} from './encargo.response';

// Doc 5, Bloque 2 — agregado raíz. Los hijos (objetos, trabajos, pagos, notas,
// fotos) cuelgan de estas rutas y llegan en Sprint 3-4, igual que el detalle
// anidado de `GET /encargos/{id}`.
@ApiTags('encargos')
@ApiBearerAuth()
@Controller('encargos')
export class EncargosController {
  constructor(
    private readonly listar: ListarEncargosUseCase,
    private readonly crear: CrearEncargoUseCase,
    private readonly obtener: ObtenerEncargoUseCase,
    private readonly actualizar: ActualizarEncargoUseCase,
    private readonly cambiarEstado: CambiarEstadoUseCase,
    private readonly reservarBloque: ReservarBloqueNumerosUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista encargos con filtros.',
    description: 'Alimenta Dashboard, Balance de Carga y Calendario. Ordena por fecha acordada.',
  })
  @ApiOkResponse({ type: RespuestaPaginadaDto })
  async listarEncargos(@Query() query: ListarEncargosQuery) {
    const pagina = await this.listar.execute(query);
    return respuestaPaginada(
      { datos: pagina.datos.map(aEncargoResponse), total: pagina.total },
      query.pagina,
      query.por_pagina,
    );
  }

  /**
   * Va antes de `:id` a propósito: Nest resuelve las rutas en orden de
   * declaración, y si `@Post(':id')` existiera primero, "reservar-bloque-numeros"
   * se tomaría como un id.
   */
  @Post('reservar-bloque-numeros')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reserva el siguiente bloque de números para este dispositivo.',
    description:
      'Patrón Hi/Lo (Doc 3, ADR-008): el dispositivo asigna números de este rango sin tocar la ' +
      'red y pide otro cuando se le agota. Los números entregados no se reutilizan, aunque el ' +
      'dispositivo no llegue a gastarlos.',
  })
  @ApiOkResponse({ type: BloqueNumerosResponse })
  reservarBloqueNumeros(@SesionActual() sesion: SesionAutenticada): Promise<BloqueNumerosResponse> {
    return this.reservarBloque.execute(sesion.negocioId);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un encargo.',
    description:
      'Nace en estado INGRESADO (Doc 2, invariante 9). `fecha_entrega_prometida` se fija igual a ' +
      '`fecha_entrega_acordada` y no vuelve a cambiar. Idempotente respecto del `id` del ' +
      'dispositivo: si ya existe, responde 200 con el existente.',
  })
  @ApiCreatedResponse({ type: EncargoResponse })
  @ApiOkResponse({ type: EncargoResponse, description: 'El id ya existía.' })
  @ApiResponse({
    status: 422,
    description:
      'ENCARGO_SIN_FECHA | ENCARGO_DESCRIPCION_VACIA | DESCUENTO_INVALIDO | ' +
      'ENCARGO_NUMERO_EN_USO | CLIENTE_NO_ENCONTRADO | FECHA_INVALIDA',
  })
  async crearEncargo(
    @Body() dto: CrearEncargoDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EncargoResponse> {
    const { encargo, creado } = await this.crear.execute(dto);
    res.status(creado ? 201 : 200);
    return aEncargoResponse(encargo);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un encargo.',
    description:
      'Los hijos anidados (objetos, trabajos, pagos, notas, fotos) que promete el Doc 5 llegan ' +
      'en Sprint 3-4, cuando existan esos módulos.',
  })
  @ApiOkResponse({ type: EncargoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO — no existe o es de otro negocio.' })
  async obtenerEncargo(@Param('id', ParseUUIDPipe) id: string): Promise<EncargoResponse> {
    return aEncargoResponse(await this.obtener.execute(id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita un encargo o lo reprograma.',
    description:
      'Parcial. No incluye el estado (tiene su propio endpoint) ni `fecha_listo` / ' +
      '`fecha_entrega_real`, que nunca son editables a mano (Doc 2, invariante 8).',
  })
  @ApiOkResponse({ type: EncargoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO' })
  @ApiResponse({ status: 422, description: 'DESCUENTO_INVALIDO | FECHA_INVALIDA' })
  async actualizarEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarEncargoDto,
  ): Promise<EncargoResponse> {
    return aEncargoResponse(await this.actualizar.execute(id, dto));
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Cambia el estado del encargo.',
    description:
      'Endpoint aparte porque dispara efectos automáticos: `fecha_listo` al pasar a LISTO y ' +
      '`fecha_entrega_real` al pasar a ENTREGADO (si se saltó LISTO, ambas quedan con la misma ' +
      'fecha). Se permite saltarse estados. Entregar con saldo pendiente se permite y solo ' +
      'devuelve una advertencia. ENTREGADO es terminal.',
  })
  @ApiOkResponse({ type: EncargoConAdvertenciasResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO' })
  @ApiResponse({ status: 422, description: 'TRANSICION_INVALIDA' })
  async cambiarEstadoEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoDto,
  ): Promise<EncargoConAdvertenciasResponse> {
    const { encargo, advertencias } = await this.cambiarEstado.execute(id, dto);
    return { ...aEncargoResponse(encargo), advertencias };
  }
}
