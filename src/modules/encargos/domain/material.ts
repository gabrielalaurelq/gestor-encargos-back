import { randomUUID } from 'node:crypto';
import { Monto } from '../../../shared/domain/monto';
import { MaterialCostoInvalidoError, MaterialNombreVacioError } from './errores';

export interface DatosNuevoMaterial {
  id?: string;
  nombre: string;
  cantidad?: string | null;
  costo?: number | string | null;
}

/**
 * Material: insumo que pone el negocio en un Trabajo (Doc 2, PRD módulo 15).
 * **Solo informativo**: no hay stock, y su `costo` no entra en `precio_total`
 * ni en ningún otro derivado del encargo — por eso sus escrituras no devuelven
 * los derivados de la raíz, igual que las notas.
 *
 * Vive dentro de un Trabajo, que vive dentro del Encargo: se escribe siempre a
 * través de `mutarAgregado()`. A diferencia de los otros hijos lleva su
 * `trabajoId`, porque es el único que cuelga de otro hijo y no de la raíz.
 *
 * Sin `aplicar()`: el Doc 5 solo define alta y baja. Para corregir un material
 * se borra y se crea otro — es un registro informativo, no hay nada que
 * preservar.
 *
 * `cantidad` es texto libre (Doc 4): "2 metros", "1 rollo", "media docena".
 * Forzar un número con unidad sería pedirle al negociante una precisión que
 * el PRD no necesita.
 */
export class Material {
  private constructor(
    readonly id: string,
    readonly trabajoId: string,
    readonly nombre: string,
    readonly cantidad: string | null,
    readonly costo: Monto | null,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  static crear(trabajoId: string, datos: DatosNuevoMaterial): Material {
    const nombre = datos.nombre.trim();
    if (nombre === '') {
      throw new MaterialNombreVacioError();
    }

    // Vacío equivale a no informarla: ambos campos son opcionales (PRD 15).
    const cantidad = datos.cantidad?.trim() || null;

    let costo: Monto | null = null;
    if (datos.costo !== undefined && datos.costo !== null) {
      costo = Monto.desde(datos.costo);
      // Doc 4: CHECK costo >= 0. El 0 vale (material de descarte, regalo).
      if (costo.esNegativo) {
        throw new MaterialCostoInvalidoError(costo.texto);
      }
    }

    return new Material(datos.id ?? randomUUID(), trabajoId, nombre, cantidad, costo);
  }

  static reconstituir(fila: {
    id: string;
    trabajoId: string;
    nombre: string;
    cantidad: string | null;
    costo: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Material {
    return new Material(
      fila.id,
      fila.trabajoId,
      fila.nombre,
      fila.cantidad,
      fila.costo === null ? null : Monto.desde(fila.costo),
      fila.creadoEn,
      fila.actualizadoEn,
    );
  }
}
