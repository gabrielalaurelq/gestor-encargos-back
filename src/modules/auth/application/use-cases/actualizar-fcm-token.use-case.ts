import { Injectable } from '@nestjs/common';
import { SesionAutenticada } from '../../../../shared/presentation/auth/sesion-autenticada';
import { AuthRepository } from '../ports/auth.repository';

/**
 * `POST /dispositivos/fcm-token` y `DELETE /dispositivos/fcm-token`
 * (Doc 5, Bloque 2).
 *
 * El dispositivo no se identifica por un id en la ruta sino por su sesión: el
 * `dispositivoId` viaja en el access token, así que un dispositivo solo puede
 * tocar su propio token.
 *
 * Borrar el token **no cierra la sesión** — es la diferencia con
 * `/auth/logout`, que elimina la fila entera (sesión + notificaciones). Este
 * endpoint solo silencia las notificaciones de este dispositivo.
 */
@Injectable()
export class ActualizarFcmTokenUseCase {
  constructor(private readonly repositorio: AuthRepository) {}

  fijar(sesion: SesionAutenticada, fcmToken: string): Promise<void> {
    return this.repositorio.fijarFcmToken(sesion.negocioId, sesion.dispositivoId, fcmToken);
  }

  borrar(sesion: SesionAutenticada): Promise<void> {
    return this.repositorio.fijarFcmToken(sesion.negocioId, sesion.dispositivoId, null);
  }
}
