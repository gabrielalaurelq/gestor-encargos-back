import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErrorAutenticacion } from '../../application/error-autenticacion';
import { DomainError } from '../../domain/domain-error';

// Doc 5, Bloque 3: formato uniforme de error para todo 4xx/5xx.
export interface CuerpoError {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: Record<string, unknown>;
  };
}

export interface ErrorTraducido {
  status: number;
  cuerpo: CuerpoError;
}

// Códigos para errores que no son de negocio (los de negocio, 422, vienen
// del catálogo del Doc 5 vía DomainError). El Doc 5 solo fija el código HTTP
// para estos casos; el `codigo` textual se define acá, una sola vez.
const CODIGOS_POR_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'SOLICITUD_INVALIDA',
  [HttpStatus.UNAUTHORIZED]: 'NO_AUTENTICADO',
  [HttpStatus.FORBIDDEN]: 'PROHIBIDO',
  [HttpStatus.NOT_FOUND]: 'NO_ENCONTRADO',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METODO_NO_PERMITIDO',
  [HttpStatus.CONFLICT]: 'CONFLICTO',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'CUERPO_DEMASIADO_GRANDE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'ENTIDAD_NO_PROCESABLE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'LIMITE_EXCEDIDO',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'ERROR_INTERNO',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICIO_NO_DISPONIBLE',
};

const MENSAJE_VALIDACION = 'Los datos enviados no son válidos.';
const MENSAJE_INTERNO = 'Ocurrió un error inesperado.';

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Traduce cualquier excepción al formato del Doc 5. Es una función pura,
 * separada del filtro, para poder testearla sin levantar la app.
 */
export function traducirExcepcion(exception: unknown): ErrorTraducido {
  // 1. Reglas de negocio (Doc 2) → 422 con el código del catálogo.
  if (exception instanceof DomainError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      cuerpo: {
        error: {
          codigo: exception.codigo,
          mensaje: exception.message,
          detalles: exception.detalles,
        },
      },
    };
  }

  // 1b. Autenticación (Guard, /auth/*) → 401 con el código propio.
  if (exception instanceof ErrorAutenticacion) {
    return {
      status: HttpStatus.UNAUTHORIZED,
      cuerpo: { error: { codigo: exception.codigo, mensaje: exception.message } },
    };
  }

  // 2. Excepciones HTTP de NestJS (Guards, class-validator, NotFound, etc.).
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const respuesta = exception.getResponse();
    const codigoPorDefecto = CODIGOS_POR_STATUS[status] ?? `HTTP_${status}`;

    // 2a. Quien lanza puede fijar su propio código pasando
    //     `{ codigo, mensaje, detalles }` como respuesta de la excepción
    //     (lo usará el módulo de auth: TOKEN_EXPIRADO, TOKEN_INVALIDO...).
    if (esObjeto(respuesta) && typeof respuesta.codigo === 'string') {
      return {
        status,
        cuerpo: {
          error: {
            codigo: respuesta.codigo,
            mensaje: typeof respuesta.mensaje === 'string' ? respuesta.mensaje : exception.message,
            detalles: esObjeto(respuesta.detalles) ? respuesta.detalles : undefined,
          },
        },
      };
    }

    // 2b. class-validator (ValidationPipe) entrega `message` como arreglo de
    //     strings → 400 con la lista en `detalles.errores`.
    if (esObjeto(respuesta) && Array.isArray(respuesta.message)) {
      return {
        status,
        cuerpo: {
          error: {
            codigo: codigoPorDefecto,
            mensaje: MENSAJE_VALIDACION,
            detalles: { errores: respuesta.message },
          },
        },
      };
    }

    // 2c. Resto de HttpException estándar.
    const mensaje =
      esObjeto(respuesta) && typeof respuesta.message === 'string'
        ? respuesta.message
        : typeof respuesta === 'string'
          ? respuesta
          : exception.message;

    return {
      status,
      cuerpo: { error: { codigo: codigoPorDefecto, mensaje } },
    };
  }

  // 3. Cualquier otra cosa → 500 sin filtrar detalle interno (Doc 8 Bloque 2).
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    cuerpo: {
      error: {
        codigo: CODIGOS_POR_STATUS[HttpStatus.INTERNAL_SERVER_ERROR],
        mensaje: MENSAJE_INTERNO,
      },
    },
  };
}

// Doc 8, Bloque 2: registrado como APP_FILTER en AppModule. Nunca expone
// stack trace al cliente — lo registra internamente (Doc 8 Bloque 4, nivel
// error para 5xx; los 4xx ya quedan en el log de la petición de pino-http).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const { status, cuerpo } = traducirExcepcion(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${httpAdapter.getRequestMethod(ctx.getRequest())} ${httpAdapter.getRequestUrl(
          ctx.getRequest(),
        )} → ${status} ${cuerpo.error.codigo}`,
        stack,
      );
    }

    httpAdapter.reply(ctx.getResponse(), cuerpo, status);
  }
}
