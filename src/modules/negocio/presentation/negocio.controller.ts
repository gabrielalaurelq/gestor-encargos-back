import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SesionActual } from '../../../shared/presentation/auth/sesion-actual.decorator';
import { SesionAutenticada } from '../../../shared/presentation/auth/sesion-autenticada';
import { ActualizarNegocioDto } from '../application/dto/actualizar-negocio.dto';
import { ActualizarNegocioUseCase } from '../application/use-cases/actualizar-negocio.use-case';
import { ObtenerNegocioUseCase } from '../application/use-cases/obtener-negocio.use-case';
import { NegocioResponse, aNegocioResponse } from './negocio.response';

// Doc 5, Bloque 2 — "Negocio (propio)". No hay `/negocios/{id}`: el negocio
// siempre es el de la sesión, así que la ruta es en singular y sin id.
@ApiTags('negocio')
@ApiBearerAuth()
@Controller('negocio')
export class NegocioController {
  constructor(
    private readonly obtener: ObtenerNegocioUseCase,
    private readonly actualizar: ActualizarNegocioUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Datos del negocio autenticado.' })
  @ApiOkResponse({ type: NegocioResponse })
  async obtenerNegocio(@SesionActual() sesion: SesionAutenticada): Promise<NegocioResponse> {
    return aNegocioResponse(await this.obtener.execute(sesion.negocioId));
  }

  @Patch()
  @ApiOperation({
    summary: 'Edita el nombre del negocio o el umbral de "Cliente no recoge".',
    description:
      'Parcial. `nombre_negocio` en `null` o vacío lo deja sin nombre; ' +
      '`dias_aviso_no_recoge` entre 1 y 30.',
  })
  @ApiOkResponse({ type: NegocioResponse })
  async actualizarNegocio(
    @SesionActual() sesion: SesionAutenticada,
    @Body() dto: ActualizarNegocioDto,
  ): Promise<NegocioResponse> {
    return aNegocioResponse(await this.actualizar.execute(sesion.negocioId, dto));
  }
}
