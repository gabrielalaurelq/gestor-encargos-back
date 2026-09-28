import { DomainError } from '../../../shared/domain/domain-error';

// Doc 5, Bloque 3: códigos del catálogo de negocio (422). `CLIENTE_NOMBRE_VACIO`
// está nombrado explícitamente en ese catálogo; `TELEFONO_INVALIDO` cae bajo su
// "etc." y queda fijado acá.

export class ClienteNombreVacioError extends DomainError {
  readonly codigo = 'CLIENTE_NOMBRE_VACIO';

  constructor() {
    super('El nombre del cliente no puede estar vacío.');
  }
}

export class TelefonoInvalidoError extends DomainError {
  readonly codigo = 'TELEFONO_INVALIDO';

  constructor(valor: string) {
    super(
      'El teléfono debe estar en formato internacional E.164, por ejemplo +51987654321.',
      // Se devuelve lo recibido para que la app pueda señalar el campo; es un
      // dato que el propio cliente envió, no información de otro negocio.
      { telefono_recibido: valor },
    );
  }
}
