import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { RequestConSesion } from '../auth/sesion-autenticada';

// Doc 5, Bloque 4: el límite general se cuenta por negocio autenticado, no
// por IP — varios dispositivos del mismo negocio comparten cupo, y un negocio
// detrás de una IP compartida (datos móviles con CG-NAT) no paga por otros.
// Para rutas @Public() (sin sesión) se cae a la IP.
//
// Debe registrarse DESPUÉS del AuthGuard (mismo arreglo de providers en
// AppModule) para que `request.sesion` ya exista.
@Injectable()
export class ThrottlerNegocioGuard extends ThrottlerGuard {
  protected async getTracker(request: RequestConSesion): Promise<string> {
    if (request.sesion) return `negocio:${request.sesion.negocioId}`;
    // `ips` viene de X-Forwarded-For cuando `trust proxy` está activo
    // (staging/producción detrás del proxy del hosting); si no, `ip`.
    const ip = request.ips?.length ? request.ips[0] : request.ip;
    return `ip:${ip}`;
  }

  // Mensaje en español; el AllExceptionsFilter lo convierte en
  // { error: { codigo: 'LIMITE_EXCEDIDO', mensaje } } con status 429. El
  // header Retry-After ya lo fijó ThrottlerGuard antes de llamar acá.
  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Demasiadas peticiones. Intenta de nuevo en un momento.');
  }
}
