import { randomUUID } from 'node:crypto';
import { Monto } from '../../../shared/domain/monto';
import { ServicioNombreVacioError, ServicioPrecioInvalidoError } from './errores';

export interface DatosNuevoServicio {
  /** UUID generado en el dispositivo (Doc 3). */
  id?: string;
  nombre: string;
  precio: number | string;
}

export interface CambiosServicio {
  precio?: number | string;
  activo?: boolean;
}

/**
 * Agregado Servicio — Catálogo de servicios (Doc 2, raíz independiente).
 * Contiene solo `nombre`, `precio` y `activo`.
 *
 * **Su relación con Trabajo es de solo lectura, y solo en el momento de crear
 * el trabajo** (Doc 2, invariante 12): el Trabajo copia nombre y precio y los
 * congela. Por eso acá no hay nada que propagar al editar — la no
 * retroactividad no se implementa, se obtiene por construcción, y será el
 * módulo Encargos (Sprint 3-4) el que deba copiar en vez de referenciar.
 *
 * **Nunca se elimina** (Doc 2, invariante 14): solo `activo = false`. Por eso
 * el Doc 5 no define `DELETE /servicios/{id}`.
 */
export class Servicio {
  private constructor(
    readonly id: string,
    private _nombre: string,
    private _precio: Monto,
    private _activo: boolean,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  /** Servicio nuevo, todavía sin persistir. Nace activo. */
  static crear(datos: DatosNuevoServicio): Servicio {
    return new Servicio(
      datos.id ?? randomUUID(),
      Servicio.validarNombre(datos.nombre),
      Servicio.validarPrecio(datos.precio),
      true,
    );
  }

  static reconstituir(fila: {
    id: string;
    nombre: string;
    precio: string;
    activo: boolean;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Servicio {
    return new Servicio(
      fila.id,
      fila.nombre,
      Monto.desde(fila.precio),
      fila.activo,
      fila.creadoEn,
      fila.actualizadoEn,
    );
  }

  get nombre(): string {
    return this._nombre;
  }

  get precio(): Monto {
    return this._precio;
  }

  get activo(): boolean {
    return this._activo;
  }

  /**
   * Aplica un PATCH parcial. Devuelve `true` si algo cambió de verdad.
   *
   * El `nombre` no se puede editar: el Doc 5 Bloque 2 define este endpoint
   * como "editar precio o `activo`", y ni el PRD (módulo 4, flujo 3b) ni el
   * Doc 2 contemplan renombrar. Para corregir un nombre se desactiva el
   * servicio y se crea otro, que es el camino que ya prevé el modelo al no
   * permitir borrado.
   */
  aplicar(cambios: CambiosServicio): boolean {
    let cambio = false;

    if (cambios.precio !== undefined) {
      const precio = Servicio.validarPrecio(cambios.precio);
      if (!precio.equals(this._precio)) {
        this._precio = precio;
        cambio = true;
      }
    }

    if (cambios.activo !== undefined && cambios.activo !== this._activo) {
      this._activo = cambios.activo;
      cambio = true;
    }

    return cambio;
  }

  private static validarNombre(nombre: string): string {
    const limpio = nombre.trim();
    if (limpio === '') {
      throw new ServicioNombreVacioError();
    }
    return limpio;
  }

  // Doc 4: CHECK servicios_precio_no_negativo (`precio >= 0`). El cero es
  // válido a propósito (PRD módulo 4: "sin precio mínimo forzado").
  private static validarPrecio(valor: number | string): Monto {
    const precio = Monto.desde(valor);
    if (precio.esNegativo) {
      throw new ServicioPrecioInvalidoError(precio.texto);
    }
    return precio;
  }
}
