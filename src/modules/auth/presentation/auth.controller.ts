import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LIMITE_AUTH } from '../../../config/rate-limit.config';
import { Public } from '../../../shared/presentation/auth/public.decorator';
import { SesionActual } from '../../../shared/presentation/auth/sesion-actual.decorator';
import { SesionAutenticada } from '../../../shared/presentation/auth/sesion-autenticada';
import { LoginDto } from '../application/dto/login.dto';
import { RefreshDto } from '../application/dto/refresh.dto';
import { CerrarSesionUseCase } from '../application/use-cases/cerrar-sesion.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { RefrescarSesionUseCase } from '../application/use-cases/refrescar-sesion.use-case';

// Doc 5, Bloque 1 — intercambio de tokens. Rutas bajo /api/v1/auth (prefijo
// global). Respuestas en snake_case como el resto del Doc 5.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refrescar: RefrescarSesionUseCase,
    private readonly cerrarSesion: CerrarSesionUseCase,
  ) {}

  @Public()
  @Throttle(LIMITE_AUTH)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Canjea el ID token de Google por access + refresh token.' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada; el Negocio se crea si no existía.' })
  @ApiResponse({ status: 401, description: 'ID_TOKEN_INVALIDO | PROVEEDOR_NO_PERMITIDO' })
  async iniciarSesion(@Body() dto: LoginDto) {
    const resultado = await this.login.execute(dto.id_token);
    return {
      access_token: resultado.accessToken,
      refresh_token: resultado.refreshToken,
      negocio: {
        id: resultado.negocio.id,
        nombre_negocio: resultado.negocio.nombreNegocio,
      },
    };
  }

  @Public()
  @Throttle(LIMITE_AUTH)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Emite un nuevo access token a partir del refresh token.' })
  @ApiResponse({ status: 401, description: 'TOKEN_INVALIDO | TOKEN_EXPIRADO | SESION_INVALIDA' })
  async refrescarSesion(@Body() dto: RefreshDto) {
    const resultado = await this.refrescar.execute(dto.refresh_token);
    return { access_token: resultado.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cierra la sesión de este dispositivo (invalida su refresh token).' })
  async cerrar(@SesionActual() sesion: SesionAutenticada): Promise<void> {
    await this.cerrarSesion.execute(sesion);
  }
}
