import { Injectable } from '@nestjs/common';
import { SesionAutenticada } from '../../../../shared/presentation/auth/sesion-autenticada';
import { AuthRepository } from '../ports/auth.repository';

// Doc 5, Bloque 1, paso 6 (`POST /auth/logout`): elimina la fila de
// `dispositivos` de este dispositivo — invalida el refresh token (ya no hay
// fila contra la cual validarlo) y deja de recibir push (se va su fcm_token
// con la fila). El access token vigente expira solo, en ≤30 min.
@Injectable()
export class CerrarSesionUseCase {
  constructor(private readonly repositorio: AuthRepository) {}

  execute(sesion: SesionAutenticada): Promise<void> {
    return this.repositorio.eliminarDispositivo(sesion.negocioId, sesion.dispositivoId);
  }
}
