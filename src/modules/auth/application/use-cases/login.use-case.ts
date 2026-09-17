import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthRepository, NegocioAutenticado } from '../ports/auth.repository';
import { ServicioTokens } from '../ports/servicio-tokens';
import { VerificadorIdentidad } from '../ports/verificador-identidad';

export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  negocio: NegocioAutenticado;
}

// Doc 5, Bloque 1, pasos 2-4 / Doc 8, Bloque 2 (`POST /auth/login`).
@Injectable()
export class LoginUseCase {
  constructor(
    private readonly verificador: VerificadorIdentidad,
    private readonly repositorio: AuthRepository,
    private readonly tokens: ServicioTokens,
  ) {}

  async execute(idToken: string): Promise<ResultadoLogin> {
    // 2. Validar el ID token de Google contra Firebase.
    const identidad = await this.verificador.verificar(idToken);

    // 3. Si el google_uid no existe, el Negocio se crea en este momento —
    //    no hay registro separado (Doc 0 §5.2, Doc 5 Bloque 1 paso 3).
    const negocio = await this.repositorio.buscarOCrearNegocio(identidad.googleUid);

    // 4. Nueva sesión de dispositivo. El id se genera acá (no en la BD)
    //    porque el refresh token lo lleva firmado y su hash se guarda en la
    //    misma fila: hay que conocer el id antes de emitir el token.
    const sesion = { negocioId: negocio.id, dispositivoId: randomUUID() };
    const refreshToken = await this.tokens.emitirRefresh(sesion);
    await this.repositorio.crearDispositivo(
      sesion.negocioId,
      sesion.dispositivoId,
      this.tokens.hash(refreshToken),
    );

    const accessToken = await this.tokens.emitirAccess(sesion);
    return { accessToken, refreshToken, negocio };
  }
}
