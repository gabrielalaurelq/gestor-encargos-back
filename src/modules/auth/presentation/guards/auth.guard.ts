import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorAutenticacion } from '../../../../shared/application/error-autenticacion';
import { ES_PUBLICO } from '../../../../shared/presentation/auth/public.decorator';
import { RequestConSesion } from '../../../../shared/presentation/auth/sesion-autenticada';
import { ServicioTokens } from '../../application/ports/servicio-tokens';

const ESQUEMA_BEARER = /^Bearer\s+(\S+)$/i;

export function extraerBearer(authorization: string | undefined): string | undefined {
  return authorization?.match(ESQUEMA_BEARER)?.[1];
}

// Doc 8, Bloque 2: Guard global (APP_GUARD) aplicado a toda ruta salvo las
// @Public(). Extrae `Authorization: Bearer <token>`, verifica firma y
// expiración, y deja `{ negocioId, dispositivoId }` en la request — de ahí lo
// toma el cliente Prisma pre-filtrado (Bloque 3) y @SesionActual().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: ServicioTokens,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) return true;

    const request = context.switchToHttp().getRequest<RequestConSesion>();
    const token = extraerBearer(request.headers.authorization);
    if (!token) {
      throw new ErrorAutenticacion(
        'TOKEN_AUSENTE',
        'Falta el header Authorization: Bearer <access_token>.',
      );
    }

    request.sesion = await this.tokens.verificarAccess(token);
    return true;
  }
}
