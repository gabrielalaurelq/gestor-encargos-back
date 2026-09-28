import { randomUUID } from 'node:crypto';
import { ClienteNombreVacioError } from './errores';
import { Telefono } from './telefono';

export interface DatosNuevoCliente {
  /** UUID generado en el dispositivo (Doc 3, ADR de identificadores). */
  id?: string;
  nombre: string;
  telefono?: string | null;
}

export interface CambiosCliente {
  nombre?: string;
  /** `null` borra el teléfono; `undefined` lo deja como está (semántica PATCH). */
  telefono?: string | null;
}

/**
 * Agregado Cliente (Doc 2, raíz independiente). Sus encargos NO están
 * embebidos: se consultan por `cliente_id`.
 *
 * No lleva `negocioId`: aunque el Doc 2 (invariante 20) lo exige en la tabla,
 * en el código lo inyecta `PrismaNegocio` desde la sesión (Doc 8 Bloque 1,
 * "ningún caso de uso pasa negocioId a mano"). Tenerlo acá invitaría a que un
 * caso de uso lo fijara, que es justo lo que `NegocioAjenoError` impide.
 */
export class Cliente {
  private constructor(
    readonly id: string,
    private _nombre: string,
    private _telefono: Telefono | null,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  /** Cliente nuevo, todavía sin persistir (sin marcas de tiempo). */
  static crear(datos: DatosNuevoCliente): Cliente {
    return new Cliente(
      datos.id ?? randomUUID(),
      Cliente.validarNombre(datos.nombre),
      Telefono.crearOpcional(datos.telefono),
    );
  }

  /** Rehidrata desde la base; los datos ya pasaron por `crear()` en su día. */
  static reconstituir(fila: {
    id: string;
    nombre: string;
    telefono: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Cliente {
    return new Cliente(
      fila.id,
      fila.nombre,
      fila.telefono === null ? null : Telefono.crear(fila.telefono),
      fila.creadoEn,
      fila.actualizadoEn,
    );
  }

  get nombre(): string {
    return this._nombre;
  }

  get telefono(): Telefono | null {
    return this._telefono;
  }

  /** Aplica un PATCH parcial. Devuelve `true` si algo cambió de verdad. */
  aplicar(cambios: CambiosCliente): boolean {
    let cambio = false;

    if (cambios.nombre !== undefined) {
      const nombre = Cliente.validarNombre(cambios.nombre);
      if (nombre !== this._nombre) {
        this._nombre = nombre;
        cambio = true;
      }
    }

    if (cambios.telefono !== undefined) {
      const telefono = Telefono.crearOpcional(cambios.telefono);
      if (telefono?.valor !== this._telefono?.valor) {
        this._telefono = telefono;
        cambio = true;
      }
    }

    return cambio;
  }

  // Doc 2, invariante 18: `nombre` obligatorio. Se valida acá y no en el DTO
  // para que el rechazo salga con el código del catálogo del Doc 5
  // (CLIENTE_NOMBRE_VACIO, 422) y no como un 400 genérico — y porque un
  // nombre de solo espacios pasa `@IsNotEmpty()` pero viola el CHECK
  // `length(trim(nombre)) > 0` del Doc 4.
  private static validarNombre(nombre: string): string {
    const limpio = nombre.trim();
    if (limpio === '') {
      throw new ClienteNombreVacioError();
    }
    return limpio;
  }
}
