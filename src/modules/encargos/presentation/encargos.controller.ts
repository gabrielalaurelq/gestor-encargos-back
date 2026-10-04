import {
  Body,
  Controller,
  Delete,
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
import { ActualizarObjetoDto, CrearObjetoDto } from '../application/dto/crear-objeto.dto';
import { CrearNotaDto } from '../application/dto/crear-nota.dto';
import { CrearPagoDto } from '../application/dto/crear-pago.dto';
import { ActualizarTrabajoDto, CrearTrabajoDto } from '../application/dto/crear-trabajo.dto';
import { ActualizarObjetoUseCase } from '../application/use-cases/actualizar-objeto.use-case';
import { ActualizarTrabajoUseCase } from '../application/use-cases/actualizar-trabajo.use-case';
import { CrearNotaUseCase } from '../application/use-cases/crear-nota.use-case';
import { CrearObjetoUseCase } from '../application/use-cases/crear-objeto.use-case';
import { CrearPagoUseCase } from '../application/use-cases/crear-pago.use-case';
import { CrearTrabajoUseCase } from '../application/use-cases/crear-trabajo.use-case';
import { EliminarObjetoUseCase } from '../application/use-cases/eliminar-objeto.use-case';
import { EliminarPagoUseCase } from '../application/use-cases/eliminar-pago.use-case';
import { EliminarTrabajoUseCase } from '../application/use-cases/eliminar-trabajo.use-case';
import {
  BloqueNumerosResponse,
  EncargoConAdvertenciasResponse,
  EncargoDetalleResponse,
  EncargoResponse,
  aEncargoDetalleResponse,
  aEncargoResponse,
} from './encargo.response';
import {
  DerivadosEncargoResponse,
  NotaResponse,
  ObjetoResponse,
  PagoResponse,
  TrabajoResponse,
  aDerivadosResponse,
  aNotaResponse,
  aObjetoResponse,
  aPagoResponse,
  aTrabajoResponse,
} from './hijos.response';

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
    private readonly crearObjeto: CrearObjetoUseCase,
    private readonly actualizarObjeto: ActualizarObjetoUseCase,
    private readonly eliminarObjeto: EliminarObjetoUseCase,
    private readonly crearTrabajo: CrearTrabajoUseCase,
    private readonly actualizarTrabajo: ActualizarTrabajoUseCase,
    private readonly eliminarTrabajo: EliminarTrabajoUseCase,
    private readonly crearPago: CrearPagoUseCase,
    private readonly eliminarPago: EliminarPagoUseCase,
    private readonly crearNota: CrearNotaUseCase,
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
    summary: 'Detalle de un encargo con sus hijos anidados.',
    description: '`fotos` llega en Sprint 7, junto con `materiales` (Doc 11).',
  })
  @ApiOkResponse({ type: EncargoDetalleResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO — no existe o es de otro negocio.' })
  async obtenerEncargo(@Param('id', ParseUUIDPipe) id: string): Promise<EncargoDetalleResponse> {
    return aEncargoDetalleResponse(await this.obtener.execute(id));
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

  // --- Hijos del agregado (Doc 5, Bloque 2) --------------------------------
  // Todos cuelgan de /encargos/{id}, nunca como recurso suelto: es la regla de
  // consistencia del Doc 2 llevada a la superficie de la API. Las escrituras
  // devuelven el hijo más los campos calculados de la raíz ya recalculados,
  // para que la app no tenga que hacer un GET extra (Doc 5, Bloque 3).

  @Post(':id/objetos')
  @ApiOperation({ summary: 'Agrega un objeto recibido al encargo.' })
  @ApiCreatedResponse({ type: ObjetoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO — el encargo no existe.' })
  @ApiResponse({ status: 422, description: 'OBJETO_DESCRIPCION_VACIA' })
  async crearObjetoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearObjetoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { hijo, encargo, creado } = await this.crearObjeto.execute(id, dto);
    res.status(creado ? 201 : 200);
    return { objeto: aObjetoResponse(hijo), encargo: aDerivadosResponse(encargo) };
  }

  @Patch(':id/objetos/:objetoId')
  @ApiOperation({ summary: 'Edita un objeto recibido.' })
  @ApiOkResponse({ type: ObjetoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO — el encargo o el objeto.' })
  async actualizarObjetoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('objetoId', ParseUUIDPipe) objetoId: string,
    @Body() dto: ActualizarObjetoDto,
  ) {
    const { objeto, encargo } = await this.actualizarObjeto.execute(id, objetoId, dto);
    return { objeto: aObjetoResponse(objeto), encargo: aDerivadosResponse(encargo) };
  }

  @Delete(':id/objetos/:objetoId')
  @ApiOperation({
    summary: 'Elimina un objeto recibido (soft delete).',
    description:
      'No borra los Trabajos vinculados: un Trabajo puede existir sin objeto (Doc 2, ' +
      'invariante 19), así que `precio_total` no cambia.',
  })
  @ApiOkResponse({ type: DerivadosEncargoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO' })
  async eliminarObjetoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('objetoId', ParseUUIDPipe) objetoId: string,
  ): Promise<DerivadosEncargoResponse> {
    return aDerivadosResponse(await this.eliminarObjeto.execute(id, objetoId));
  }

  @Post(':id/trabajos')
  @ApiOperation({
    summary: 'Agrega un trabajo, desde el catálogo o personalizado.',
    description:
      'Con `servicio_id` se copian el nombre y el precio del Servicio y el precio queda ' +
      'bloqueado (Doc 2, invariantes 12-13); con `descripcion` + `precio` el trabajo es ' +
      'personalizado y editable. Las dos vías son excluyentes. Recalcula `precio_total`.',
  })
  @ApiCreatedResponse({ type: TrabajoResponse })
  @ApiResponse({
    status: 422,
    description:
      'TRABAJO_ORIGEN_AMBIGUO | TRABAJO_DESCRIPCION_VACIA | TRABAJO_PRECIO_INVALIDO | ' +
      'SERVICIO_NO_DISPONIBLE | OBJETO_NO_EN_ENCARGO | MONTO_INVALIDO',
  })
  async crearTrabajoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearTrabajoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { hijo, encargo, creado } = await this.crearTrabajo.execute(id, dto);
    res.status(creado ? 201 : 200);
    return { trabajo: aTrabajoResponse(hijo), encargo: aDerivadosResponse(encargo) };
  }

  @Patch(':id/trabajos/:trabajoId')
  @ApiOperation({
    summary: 'Edita un trabajo.',
    description:
      'Si el trabajo vino del catálogo, tocar el precio da 422 TRABAJO_PRECIO_BLOQUEADO ' +
      '(Doc 2, invariante 13). La descripción sí es editable en ambos casos.',
  })
  @ApiOkResponse({ type: TrabajoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO' })
  @ApiResponse({ status: 422, description: 'TRABAJO_PRECIO_BLOQUEADO | TRABAJO_PRECIO_INVALIDO' })
  async actualizarTrabajoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('trabajoId', ParseUUIDPipe) trabajoId: string,
    @Body() dto: ActualizarTrabajoDto,
  ) {
    const { trabajo, encargo } = await this.actualizarTrabajo.execute(id, trabajoId, dto);
    return { trabajo: aTrabajoResponse(trabajo), encargo: aDerivadosResponse(encargo) };
  }

  @Delete(':id/trabajos/:trabajoId')
  @ApiOperation({
    summary: 'Elimina un trabajo (soft delete) y recalcula el precio total.',
    description:
      'Si la nueva suma queda por debajo del descuento vigente, el descuento se ajusta solo ' +
      '(Doc 2, invariante 2): el usuario no pidió ese cambio, lo provocó borrar el trabajo.',
  })
  @ApiOkResponse({ type: DerivadosEncargoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO' })
  async eliminarTrabajoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('trabajoId', ParseUUIDPipe) trabajoId: string,
  ): Promise<DerivadosEncargoResponse> {
    return aDerivadosResponse(await this.eliminarTrabajo.execute(id, trabajoId));
  }

  @Post(':id/pagos')
  @ApiOperation({
    summary: 'Registra un pago y recalcula el saldo pendiente.',
    description: 'La `fecha` la asigna el servidor, nunca el request (Doc 2, invariante 4).',
  })
  @ApiCreatedResponse({ type: PagoResponse })
  @ApiResponse({ status: 422, description: 'PAGO_MONTO_INVALIDO | ORIGEN_PAGO_INVALIDO' })
  async crearPagoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearPagoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { hijo, encargo, creado } = await this.crearPago.execute(id, dto);
    res.status(creado ? 201 : 200);
    return { pago: aPagoResponse(hijo), encargo: aDerivadosResponse(encargo) };
  }

  @Delete(':id/pagos/:pagoId')
  @ApiOperation({
    summary: 'Elimina un pago (soft delete) y recalcula el saldo pendiente.',
    description:
      'No hay PATCH: un pago no se edita, se borra y se vuelve a crear, para preservar el ' +
      'rastro de auditoría (Doc 5, Bloque 2). El borrado es lógico por el invariante 15.',
  })
  @ApiOkResponse({ type: DerivadosEncargoResponse })
  @ApiResponse({ status: 404, description: 'NO_ENCONTRADO' })
  async eliminarPagoDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pagoId', ParseUUIDPipe) pagoId: string,
  ): Promise<DerivadosEncargoResponse> {
    return aDerivadosResponse(await this.eliminarPago.execute(id, pagoId));
  }

  @Post(':id/notas')
  @ApiOperation({
    summary: 'Agrega una nota al encargo.',
    description:
      'Sin PATCH ni DELETE: una nota es inmutable una vez creada (Doc 2, invariante 16). La ' +
      '`fecha` la asigna el servidor.',
  })
  @ApiCreatedResponse({ type: NotaResponse })
  @ApiResponse({ status: 422, description: 'NOTA_TEXTO_VACIO' })
  async crearNotaDelEncargo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearNotaDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<NotaResponse> {
    const { hijo, creado } = await this.crearNota.execute(id, dto);
    res.status(creado ? 201 : 200);
    // Una nota no afecta a ningún campo calculado, así que no se devuelven los
    // derivados de la raíz: no hay nada que refrescar.
    return aNotaResponse(hijo);
  }
}
