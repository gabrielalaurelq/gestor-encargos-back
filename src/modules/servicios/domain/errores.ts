import { DomainError } from '../../../shared/domain/domain-error';

// Doc 5, Bloque 3: `SERVICIO_NOMBRE_VACIO` está nombrado en el catálogo;
// `SERVICIO_PRECIO_INVALIDO` cae bajo su "etc.", en paralelo con el
// `PAGO_MONTO_INVALIDO` que sí figura.

export class ServicioNombreVacioError extends DomainError {
  readonly codigo = 'SERVICIO_NOMBRE_VACIO';

  constructor() {
    super('El nombre del servicio no puede estar vacío.');
  }
}

export class ServicioPrecioInvalidoError extends DomainError {
  readonly codigo = 'SERVICIO_PRECIO_INVALIDO';

  constructor(precio: string) {
    super(
      // Cero sí se permite: el PRD (módulo 4) admite un servicio en S/0 —
      // por ejemplo un retoque de garantía.
      'El precio de un servicio no puede ser negativo.',
      { precio_recibido: precio },
    );
  }
}
