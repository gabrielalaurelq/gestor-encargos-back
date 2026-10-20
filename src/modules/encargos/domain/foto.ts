import { randomUUID } from 'node:crypto';

export interface DatosNuevaFoto {
  id?: string;
  /** Objeto al que pertenece; `null`/ausente = foto general del encargo (PRD 14). */
  objetoRecibidoId?: string | null;
}

/**
 * Foto: metadatos de una imagen guardada en R2 (Doc 4, PRD 14). El binario no
 * vive acá ni pasa por el backend; esta entidad solo registra que existe y
 * dónde. Hijo del agregado Encargo, como los demás.
 *
 * `clave` (la ruta del objeto en R2) la asigna la infraestructura al
 * persistir, porque depende del negocio y de la nomenclatura del Doc 8 — el
 * dominio no sabe de buckets. Por eso es opcional antes de guardar.
 *
 * Sin `aplicar()`: una foto no se edita. Para "moverla" a otro objeto se borra
 * y se toma otra.
 */
export class Foto {
  private constructor(
    readonly id: string,
    readonly objetoRecibidoId: string | null,
    readonly clave?: string,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  static crear(datos: DatosNuevaFoto): Foto {
    return new Foto(datos.id ?? randomUUID(), datos.objetoRecibidoId ?? null);
  }

  static reconstituir(fila: {
    id: string;
    objetoRecibidoId: string | null;
    clave: string;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Foto {
    return new Foto(fila.id, fila.objetoRecibidoId, fila.clave, fila.creadoEn, fila.actualizadoEn);
  }
}
