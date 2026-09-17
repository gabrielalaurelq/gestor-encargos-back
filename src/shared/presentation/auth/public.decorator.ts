import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';

// Doc 8, Bloque 2: el AuthGuard global se aplica a toda ruta salvo las
// marcadas con @Public() — /auth/login, /auth/refresh y, en Fase 2, los
// webhooks de Doc 10 (que autentican por firma del proveedor).
export const Public = () => SetMetadata(ES_PUBLICO, true);
