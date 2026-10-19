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

// --- Hijos del agregado (Sprint 3-4) ---------------------------------------

export class ObjetoDescripcionVaciaError extends DomainError {
  readonly codigo = 'OBJETO_DESCRIPCION_VACIA';

  constructor() {
    super('La descripción del objeto no puede estar vacía.');
  }
}

export class TrabajoDescripcionVaciaError extends DomainError {
  readonly codigo = 'TRABAJO_DESCRIPCION_VACIA';

  constructor() {
    super('La descripción del trabajo no puede estar vacía.');
  }
}

export class TrabajoPrecioInvalidoError extends DomainError {
  readonly codigo = 'TRABAJO_PRECIO_INVALIDO';

  constructor(precio: string) {
    // El 0 se permite (PRD módulo 3: retoque de garantía); solo se rechaza el
    // negativo, igual que el CHECK del Doc 4.
    super('El precio de un trabajo no puede ser negativo.', { precio_recibido: Number(precio) });
  }
}

export class TrabajoPrecioBloqueadoError extends DomainError {
  readonly codigo = 'TRABAJO_PRECIO_BLOQUEADO';

  constructor(trabajoId: string, servicioId: string) {
    // Doc 2, invariante 13 / Doc 5, catálogo.
    super(
      'El precio de un trabajo creado desde el catálogo no se edita. Cree un trabajo ' +
        'personalizado en su lugar, o edite el servicio del catálogo (no afecta a este trabajo).',
      { trabajo_id: trabajoId, servicio_id: servicioId },
    );
  }
}

export class ServicioNoDisponibleError extends DomainError {
  readonly codigo = 'SERVICIO_NO_DISPONIBLE';

  constructor(servicioId: string, motivo: 'no_existe' | 'inactivo') {
    super(
      motivo === 'inactivo'
        ? 'El servicio está desactivado y no puede usarse para trabajos nuevos.'
        : 'El servicio indicado no existe en este negocio.',
      { servicio_id: servicioId },
    );
  }
}

export class ObjetoNoEnEncargoError extends DomainError {
  readonly codigo = 'OBJETO_NO_EN_ENCARGO';

  constructor(objetoId: string) {
    super('El objeto indicado no pertenece a este encargo.', { objeto_recibido_id: objetoId });
  }
}

export class PagoMontoInvalidoError extends DomainError {
  readonly codigo = 'PAGO_MONTO_INVALIDO';

  constructor(monto: string) {
    // Doc 4: CHECK monto > 0 / Doc 5, catálogo.
    super('El monto de un pago debe ser mayor que cero.', { monto_recibido: Number(monto) });
  }
}

export class OrigenPagoInvalidoError extends DomainError {
  readonly codigo = 'ORIGEN_PAGO_INVALIDO';

  constructor(origenId: number) {
    // Doc 2, invariante 5: el origen debe ser uno de los reconocidos. Es un
    // catálogo del sistema (Doc 4), no una tabla por negocio.
    super('El origen de pago indicado no existe o está desactivado.', { origen_id: origenId });
  }
}

export class NotaTextoVacioError extends DomainError {
  readonly codigo = 'NOTA_TEXTO_VACIO';

  constructor() {
    super('El texto de la nota no puede estar vacío.');
  }
}

// --- Materiales (Sprint 7) ---------------------------------------------------

export class MaterialNombreVacioError extends DomainError {
  readonly codigo = 'MATERIAL_NOMBRE_VACIO';

  constructor() {
    super('El nombre del material no puede estar vacío.');
  }
}

export class MaterialCostoInvalidoError extends DomainError {
  readonly codigo = 'MATERIAL_COSTO_INVALIDO';

  constructor(costo: string) {
    // Doc 4: CHECK costo >= 0. Sin este código, el CHECK daría un 500.
    super('El costo de un material no puede ser negativo.', { costo_recibido: Number(costo) });
  }
}
