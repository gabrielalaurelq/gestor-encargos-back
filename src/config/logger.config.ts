import { Params } from 'nestjs-pino';
import { Ambiente } from './env.validation';

// Doc 8, Bloque 4: logger estructurado en JSON con nestjs-pino. Niveles:
// error/warn/info siempre; debug solo en development. Sin plataforma externa
// de observabilidad — lo que exponga el proveedor de hosting alcanza.
//
// Regla dura del mismo bloque: nunca se loguea el refresh token ni el ID
// token de Google, en ningún nivel. pino-http no serializa el body por
// defecto, pero se redactan igual esos campos y el header Authorization para
// que la regla se cumpla aunque alguien habilite el log del body más adelante.
const CAMPOS_REDACTADOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.id_token',
  'req.body.refresh_token',
  'res.headers["set-cookie"]',
];

export function configurarLogger(ambiente: Ambiente): Params {
  return {
    pinoHttp: {
      level: ambiente === Ambiente.development ? 'debug' : 'info',
      redact: {
        paths: CAMPOS_REDACTADOS,
        censor: '[REDACTADO]',
      },
      // Las peticiones se loguean al terminar, con status y duración; el
      // nivel sube solo a warn/error según el status para no ensuciar info.
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
