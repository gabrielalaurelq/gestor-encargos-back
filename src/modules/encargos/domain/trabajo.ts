import { randomUUID } from 'node:crypto';
import { Monto } from '../../../shared/domain/monto';
import {
  TrabajoDescripcionVaciaError,
  TrabajoPrecioBloqueadoError,
  TrabajoPrecioInvalidoError,
} from './errores';

/** Servicio del catálogo del que se copia un Trabajo (Doc 2, invariante 12). */
export interface ServicioDelCatalogo {
  id: string;
  nombre: string;
  precio: Monto;
}

export interface DatosNuevoTrabajo {
  id?: string;
  /** Objeto al que se vincula, si lo hay (Doc 2, invariante 19: opcional). */
  objetoRecibidoId?: string | null;
}

export interface CambiosTrabajo {
  descripcion?: string;
  precio?: number | string;
  objetoRecibidoId?: string | null;
}

/**
 * Trabajo: una tarea dentro del encargo, con su propio precio (Doc 2). Nace de
 * dos formas y la diferencia es permanente:
 *
 * - **Desde el catálogo** (`desdeServicio`): se copian el nombre del Servicio
 *   —a `descripcion`— y su precio, y el precio **queda bloqueado** (invariantes
 *   12 y 13). Copiar y no referenciar es lo que hace que editar el catálogo
 *   mañana no reescriba este trabajo: la no retroactividad no es una regla que
 *   se comprueba, es una consecuencia de la copia.
 * - **Personalizado** (`personalizado`): descripción y precio libres, editables.
 *
 * `servicioId` se guarda solo como rastro de procedencia —para saber que el
 * precio está bloqueado y para la métrica "% de trabajos desde catálogo" del
 * PRD—, nunca para leer el precio en vivo.
 */
export class Trabajo {
  private constructor(
    readonly id: string,
    readonly servicioId: string | null,
    private _objetoRecibidoId: string | null,
    private _descripcion: string,
    private _precio: Monto,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  static desdeServicio(datos: DatosNuevoTrabajo, servicio: ServicioDelCatalogo): Trabajo {
    return new Trabajo(
      datos.id ?? randomUUID(),
      servicio.id,
      datos.objetoRecibidoId ?? null,
      // El nombre del Servicio pasa a ser la descripción del Trabajo
      // (Doc 2, regla 12). Se copia el valor, no se referencia.
      Trabajo.validarDescripcion(servicio.nombre),
      Trabajo.validarPrecio(servicio.precio),
    );
  }

  static personalizado(
    datos: DatosNuevoTrabajo & { descripcion: string; precio: number | string },
  ): Trabajo {
    return new Trabajo(
      datos.id ?? randomUUID(),
      null,
      datos.objetoRecibidoId ?? null,
      Trabajo.validarDescripcion(datos.descripcion),
      Trabajo.validarPrecio(Monto.desde(datos.precio)),
    );
  }

  static reconstituir(fila: {
    id: string;
    servicioId: string | null;
    objetoRecibidoId: string | null;
    descripcion: string;
    precio: string;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Trabajo {
    return new Trabajo(
      fila.id,
      fila.servicioId,
      fila.objetoRecibidoId,
      fila.descripcion,
      Monto.desde(fila.precio),
      fila.creadoEn,
      fila.actualizadoEn,
    );
  }

  get descripcion(): string {
    return this._descripcion;
  }

  get precio(): Monto {
    return this._precio;
  }

  get objetoRecibidoId(): string | null {
    return this._objetoRecibidoId;
  }

  /** `true` si vino del catálogo y por tanto tiene el precio congelado. */
  get precioBloqueado(): boolean {
    return this.servicioId !== null;
  }

  aplicar(cambios: CambiosTrabajo): boolean {
    let cambio = false;

    if (cambios.precio !== undefined) {
      // Doc 2, invariante 13: el precio de un trabajo del catálogo no se edita
      // desde el trabajo. La única vía es crearlo como personalizado, o editar
      // el catálogo —que no afecta a este—.
      if (this.precioBloqueado) {
        throw new TrabajoPrecioBloqueadoError(this.id, this.servicioId as string);
      }
      const precio = Trabajo.validarPrecio(Monto.desde(cambios.precio));
      if (!precio.equals(this._precio)) {
        this._precio = precio;
        cambio = true;
      }
    }

    if (cambios.descripcion !== undefined) {
      const descripcion = Trabajo.validarDescripcion(cambios.descripcion);
      if (descripcion !== this._descripcion) {
        this._descripcion = descripcion;
        cambio = true;
      }
    }

    if (
      cambios.objetoRecibidoId !== undefined &&
      cambios.objetoRecibidoId !== this._objetoRecibidoId
    ) {
      this._objetoRecibidoId = cambios.objetoRecibidoId;
      cambio = true;
    }

    return cambio;
  }

  private static validarDescripcion(descripcion: string): string {
    const limpia = descripcion.trim();
    if (limpia === '') {
      throw new TrabajoDescripcionVaciaError();
    }
    return limpia;
  }

  // PRD módulo 3: se permite precio 0 (ej. retoque de garantía); solo se
  // rechaza el negativo, como el CHECK del Doc 4.
  private static validarPrecio(precio: Monto): Monto {
    if (precio.esNegativo) {
      throw new TrabajoPrecioInvalidoError(precio.texto);
    }
    return precio;
  }
}
