import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestConSesion, SesionAutenticada } from './sesion-autenticada';

// Inyecta en el handler la sesión que dejó el AuthGuard. Si se usa en una
// ruta @Public() es un error de programación, no de la petición: se lanza un
// Error plano (→ 500) para que salte en desarrollo.
export const SesionActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SesionAutenticada => {
    const request = ctx.switchToHttp().getRequest<RequestConSesion>();
    if (!request.sesion) {
      throw new Error('@SesionActual() usado en una ruta sin AuthGuard (¿marcada @Public()?)');
    }
    return request.sesion;
  },
);
