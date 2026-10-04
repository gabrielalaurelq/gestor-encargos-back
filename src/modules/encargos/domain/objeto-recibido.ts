import { randomUUID } from 'node:crypto';
import { ObjetoDescripcionVaciaError } from './errores';

export interface DatosNuevoObjeto {
  id?: string;
  descripcion: string;
}

/**
 * ObjetoRecibido: lo que el cliente deja físicamente (Doc 2). Vive **dentro**
 * del agregado Encargo; no se escribe nunca de forma aislada.
 *
 * No lleva `encargoId` ni `negocioId`: el primero lo aporta la transacción de
 * agregado y el segundo la extensión de `PrismaNegocio`. Mismo criterio que
 * `Cliente` con `negocioId`.
 */
export class ObjetoRecibido {
  private constructor(
    readonly id: string,
    private _descripcion: string,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  static crear(datos: DatosNuevoObjeto): ObjetoRecibido {
    return new ObjetoRecibido(
      datos.id ?? randomUUID(),
      ObjetoRecibido.validarDescripcion(datos.descripcion),
    );
  }

  static reconstituir(fila: {
    id: string;
    descripcion: string;
    creadoEn: Date;
    actualizadoEn: Date;
  }): ObjetoRecibido {
    return new ObjetoRecibido(fila.id, fila.descripcion, fila.creadoEn, fila.actualizadoEn);
  }

  get descripcion(): string {
    return this._descripcion;
  }

  aplicar(cambios: { descripcion?: string }): boolean {
    if (cambios.descripcion === undefined) {
      return false;
    }
    const descripcion = ObjetoRecibido.validarDescripcion(cambios.descripcion);
    if (descripcion === this._descripcion) {
      return false;
    }
    this._descripcion = descripcion;
    return true;
  }

  private static validarDescripcion(descripcion: string): string {
    const limpia = descripcion.trim();
    if (limpia === '') {
      throw new ObjetoDescripcionVaciaError();
    }
    return limpia;
  }
}
