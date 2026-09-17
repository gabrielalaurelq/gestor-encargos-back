// Doc 8, Bloque 2: las reglas de negocio se lanzan como excepciones de
// dominio propias desde los casos de uso (ej. `DescuentoInvalidoError`), y el
// AllExceptionsFilter las mapea a 422 con el `codigo` del catálogo del Doc 5
// Bloque 3. Vive en shared/domain/ porque los tres Bounded Context la
// extienden; no tiene decoradores de NestJS ni imports de infraestructura
// (regla de la capa domain, Doc 8 Bloque 1).
export abstract class DomainError extends Error {
  /** Código estable del catálogo del Doc 5 (ej. `DESCUENTO_INVALIDO`). */
  abstract readonly codigo: string;

  /** Datos que ayudan al cliente a explicar el rechazo (ej. montos en juego). */
  readonly detalles?: Record<string, unknown>;

  protected constructor(mensaje: string, detalles?: Record<string, unknown>) {
    super(mensaje);
    this.name = new.target.name;
    this.detalles = detalles;
  }
}
