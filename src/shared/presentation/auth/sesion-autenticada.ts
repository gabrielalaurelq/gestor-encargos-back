import { Request } from 'express';

// Doc 8, Bloque 2: lo que el AuthGuard deja en la request tras validar el
// access token. `negocioId` alimenta el filtro de multitenancy de Prisma;
// `dispositivoId` identifica la fila de `dispositivos` (sesión de este
// dispositivo, Doc 4 v1.3) para /auth/logout y para el token FCM.
export interface SesionAutenticada {
  negocioId: string;
  dispositivoId: string;
}

export interface RequestConSesion extends Request {
  sesion?: SesionAutenticada;
}
