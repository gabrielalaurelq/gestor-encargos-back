import { Injectable } from '@nestjs/common';
import { ErrorAutenticacion } from '../../../../shared/application/error-autenticacion';
import { AuthRepository } from '../ports/auth.repository';
import { ServicioTokens } from '../ports/servicio-tokens';

// Doc 5, Bloque 1, paso 5 / Doc 8, Bloque 2 (`POST /auth/refresh`): ruta
// pública con validación propia — se verifica la firma del refresh token, se
// hashea y se busca la fila de `dispositivos`; sin fila (logout previo), 401.
// El refresh token NO se rota: sigue siendo el mismo hasta su vencimiento o
// hasta /auth/logout, tal como describe el Doc 5.
@Injectable()
export class RefrescarSesionUseCase {
  constructor(
    private readonly repositorio: AuthRepository,
    private readonly tokens: ServicioTokens,
  ) {}

  async execute(refreshToken: string): Promise<{ accessToken: string }> {
    const sesion = await this.tokens.verificarRefresh(refreshToken);

    const sesionVigente = await this.repositorio.existeDispositivo(
      sesion.negocioId,
      sesion.dispositivoId,
      this.tokens.hash(refreshToken),
    );
    if (!sesionVigente) {
      throw new ErrorAutenticacion(
        'SESION_INVALIDA',
        'La sesión ya no existe. Vuelve a iniciar sesión con Google.',
      );
    }

    return { accessToken: await this.tokens.emitirAccess(sesion) };
  }
}
