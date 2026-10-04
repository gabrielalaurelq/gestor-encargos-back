import { DomainError } from '../../../shared/domain/domain-error';

// Doc 5, Bloque 3: `DESCUENTO_INVALIDO` y `ENCARGO_SIN_FECHA` están nombrados
// en el catálogo; los otros dos se fijan acá.

export class DescuentoInvalidoError extends DomainError {
  readonly codigo = 'DESCUENTO_INVALIDO';

  constructor(descuento: string, sumaTrabajos: string) {
    // Doc 2, invariante 2. Los detalles son los mismos del ejemplo del Doc 5.
    super('El descuento no puede ser mayor a la suma de los trabajos.', {
      descuento_solicitado: Number(descuento),
      suma_trabajos: Number(sumaTrabajos),
    });
  }
}

export class DescuentoNegativoError extends DomainError {
  readonly codigo = 'DESCUENTO_INVALIDO';

  constructor(descuento: string) {
    super('El descuento no puede ser negativo.', { descuento_solicitado: Number(descuento) });
  }
}

export class EncargoSinFechaError extends DomainError {
  readonly codigo = 'ENCARGO_SIN_FECHA';

  constructor() {
    // Doc 5 Bloque 3 / PRD módulo 2: la fecha de entrega acordada es
    // obligatoria al crear, aunque sea estimada.
    super('El encargo necesita una fecha de entrega acordada, aunque sea estimada.');
  }
}

export class EncargoDescripcionVaciaError extends DomainError {
  readonly codigo = 'ENCARGO_DESCRIPCION_VACIA';

  constructor() {
    super('La descripción del encargo no puede estar vacía.');
  }
}

export class EncargoNumeroEnUsoError extends DomainError {
  readonly codigo = 'ENCARGO_NUMERO_EN_USO';

  constructor(numero: number) {
    // Doc 2, invariante 21: el número es único dentro del negocio. Pasa si dos
    // dispositivos asignan del mismo bloque, o si uno reinstala y repite.
    super(`El número ${numero} ya está usado por otro encargo de este negocio.`, {
      numero,
    });
  }
}
