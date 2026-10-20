/**
 * Horizonte de retención de tombstones (Doc 4, Bloque 3): las filas con
 * `eliminado_en` se borran físicamente pasados estos días.
 *
 * Vive en un solo sitio porque **dos piezas tienen que coincidir exactamente**:
 * - `PurgaSoftDeleteJob` borra lo que quedó por detrás del límite.
 * - `GET /sync` responde `410` a un dispositivo cuyo `since` quedó por detrás
 *   del mismo límite: podría haberse perdido tombstones ya purgados y quedarse
 *   para siempre con filas fantasma (Doc 5 v1.5).
 * Si la purga usara un horizonte más corto que el de `/sync`, quedaría una
 * ventana donde se pierden borrados sin que nadie lo detecte.
 *
 * También es el horizonte de las fechas de hecho en el pasado (Doc 5:
 * `resolverFechaDeHecho`), aunque allí por otro motivo.
 */
export const DIAS_RETENCION_TOMBSTONES = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Instante antes del cual un tombstone puede haber sido purgado ya. */
export function limiteRetencion(ahora: Date): Date {
  return new Date(ahora.getTime() - DIAS_RETENCION_TOMBSTONES * MS_POR_DIA);
}
