import {
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SesionActual } from '../../../shared/presentation/auth/sesion-actual.decorator';
import { SesionAutenticada } from '../../../shared/presentation/auth/sesion-autenticada';
import { FcmTokenDto } from '../application/dto/fcm-token.dto';
import { FcmTokenEnUsoError } from '../application/fcm-token-en-uso.error';
import { ActualizarFcmTokenUseCase } from '../application/use-cases/actualizar-fcm-token.use-case';

/**
 * Doc 5, Bloque 2 — "Dispositivos: la fila ya existe desde el login; estos
 * endpoints la actualizan".
 *
 * Vive en el módulo `auth` y no en uno propio porque la fila de `dispositivos`
 * **es** la sesión de este dispositivo: auth gobierna su ciclo de vida (la
 * crea en el login, la borra en el logout) y el token FCM es una columna de
 * esa misma fila. Partir la propiedad en dos módulos significaría que dos
 * dueños escriben la misma fila. `Dispositivo` tampoco es un agregado del Doc
 * 2 — se añadió en el Doc 4 v1.3 como soporte de la sesión.
 */
@ApiTags('dispositivos')
@ApiBearerAuth()
@Controller('dispositivos')
export class DispositivosController {
  constructor(private readonly fcmToken: ActualizarFcmTokenUseCase) {}

  @Post('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registra el token de notificaciones de este dispositivo.',
    description:
      'Se llama justo después de `/auth/login` y cada vez que Firebase rota el token. El ' +
      'dispositivo se identifica por su sesión, no por un id en la ruta. Si otro dispositivo ' +
      'del mismo negocio tenía ese token (la app se reinstaló y Firebase lo reasignó), se le ' +
      'suelta automáticamente.',
  })
  @ApiResponse({ status: 204, description: 'Token registrado.' })
  @ApiResponse({
    status: 409,
    description:
      'FCM_TOKEN_EN_USO — lo tiene un dispositivo de otro negocio cuya sesión nunca se cerró. ' +
      'Se resuelve cuando esa sesión antigua hace logout.',
  })
  async registrar(
    @SesionActual() sesion: SesionAutenticada,
    @Body() dto: FcmTokenDto,
  ): Promise<void> {
    try {
      await this.fcmToken.fijar(sesion, dto.fcm_token);
    } catch (error) {
      if (error instanceof FcmTokenEnUsoError) {
        throw new ConflictException({ codigo: 'FCM_TOKEN_EN_USO', mensaje: error.message });
      }
      throw error;
    }
  }

  @Delete('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Silencia las notificaciones de este dispositivo.',
    description:
      'Pone `fcm_token` en null **sin cerrar la sesión** — es la diferencia con ' +
      '`/auth/logout`, que elimina la fila completa (sesión y notificaciones a la vez). ' +
      'Idempotente: borrar un token que ya no estaba no falla.',
  })
  @ApiResponse({ status: 204, description: 'Notificaciones silenciadas.' })
  async silenciar(@SesionActual() sesion: SesionAutenticada): Promise<void> {
    await this.fcmToken.borrar(sesion);
  }
}
