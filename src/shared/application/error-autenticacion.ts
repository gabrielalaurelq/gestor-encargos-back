// Errores de autenticación (401, Doc 5 Bloque 3: "token ausente, inválido o
// expirado"). No son reglas de negocio (eso es DomainError → 422) ni
// excepciones HTTP de NestJS: los casos de uso y el Guard los lanzan sin
// conocer HTTP, y el AllExceptionsFilter los traduce a 401 con su `codigo`.
export type CodigoAutenticacion =
  | 'TOKEN_AUSENTE'
  | 'TOKEN_INVALIDO'
  | 'TOKEN_EXPIRADO'
  | 'SESION_INVALIDA'
  | 'ID_TOKEN_INVALIDO'
  | 'PROVEEDOR_NO_PERMITIDO';

export class ErrorAutenticacion extends Error {
  constructor(
    readonly codigo: CodigoAutenticacion,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorAutenticacion';
  }
}
