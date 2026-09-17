import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { ErrorAutenticacion } from '../../../shared/application/error-autenticacion';
import { SesionAutenticada } from '../../../shared/presentation/auth/sesion-autenticada';
import { ServicioTokens } from '../application/ports/servicio-tokens';

type TipoToken = 'access' | 'refresh';

// Claims propios, además de los estándar (sub = negocioId, exp, iat, jti).
interface PayloadToken {
  sub?: string;
  dis?: string;
  tipo?: TipoToken;
}

@Injectable()
export class JwtServicioTokens extends ServicioTokens {
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    super();
    this.accessExpiresIn = config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiresIn = config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
  }

  emitirAccess(sesion: SesionAutenticada): Promise<string> {
    return this.jwt.signAsync(
      { dis: sesion.dispositivoId, tipo: 'access' satisfies TipoToken },
      { subject: sesion.negocioId, expiresIn: this.accessExpiresIn },
    );
  }

  emitirRefresh(sesion: SesionAutenticada): Promise<string> {
    // jti aleatorio: dos logins del mismo dispositivo en el mismo segundo
    // producirían tokens (y hashes) idénticos sin él.
    return this.jwt.signAsync(
      { dis: sesion.dispositivoId, tipo: 'refresh' satisfies TipoToken },
      { subject: sesion.negocioId, expiresIn: this.refreshExpiresIn, jwtid: randomUUID() },
    );
  }

  verificarAccess(token: string): Promise<SesionAutenticada> {
    return this.verificar(token, 'access');
  }

  verificarRefresh(token: string): Promise<SesionAutenticada> {
    return this.verificar(token, 'refresh');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async verificar(token: string, tipoEsperado: TipoToken): Promise<SesionAutenticada> {
    let payload: PayloadToken;
    try {
      payload = await this.jwt.verifyAsync<PayloadToken>(token);
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new ErrorAutenticacion('TOKEN_EXPIRADO', `El ${tipoEsperado} token expiró.`);
      }
      throw new ErrorAutenticacion('TOKEN_INVALIDO', `El ${tipoEsperado} token no es válido.`);
    }

    // El claim `tipo` impide usar un refresh token como access token (o al
    // revés) aunque ambos estén firmados con el mismo secreto.
    if (
      payload.tipo !== tipoEsperado ||
      typeof payload.sub !== 'string' ||
      typeof payload.dis !== 'string'
    ) {
      throw new ErrorAutenticacion('TOKEN_INVALIDO', `El ${tipoEsperado} token no es válido.`);
    }

    return { negocioId: payload.sub, dispositivoId: payload.dis };
  }
}
