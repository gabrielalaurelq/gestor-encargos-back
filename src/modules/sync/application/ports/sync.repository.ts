/**
 * Puerto de lectura de `GET /sync` (Doc 5, Bloque 1 — "el endpoint más
 * importante del documento").
 *
 * Es una **lectura cross-agregado**: recorre las 9 tablas del negocio sin pasar
 * por las raíces. El Doc 2 lo permite explícitamente ("módulos como Caja
 * diaria, Balance de Carga o Búsqueda consultan datos de muchos Encargos a la
 * vez con fines de reporte — eso es lectura, no escritura"). Por eso este
 * módulo no tiene capa `domain/` con entidades: no sostiene invariantes, solo
 * proyecta filas.
 *
 * Los tombstones (`eliminado_en`) **sí viajan**, como cualquier otro cambio: es
 * lo que permite al cliente borrar en local (Doc 4, Bloque 3).
 */
export interface FilaSync {
  [campo: string]: unknown;
}

/** Las 9 colecciones que fija el Doc 5, Bloque 1. */
export interface CambiosSync {
  clientes: FilaSync[];
  servicios: FilaSync[];
  encargos: FilaSync[];
  objetos_recibidos: FilaSync[];
  trabajos: FilaSync[];
  materiales: FilaSync[];
  pagos: FilaSync[];
  notas: FilaSync[];
  fotos: FilaSync[];
}

export interface ResultadoCambios {
  cambios: CambiosSync;
  /**
   * `actualizado_en` más antiguo entre las últimas filas enviadas de las
   * colecciones que se truncaron; `null` si cupo todo.
   */
  corte: Date | null;
}

export abstract class SyncRepository {
  /**
   * @param since Marca inclusiva (`>=`). `null` en la primera sincronización:
   *   devuelve el estado completo del negocio.
   * @param limitePorColeccion Tope de filas por colección; al superarlo se
   *   trunca y se informa el corte.
   */
  abstract cambiosDesde(since: Date | null, limitePorColeccion: number): Promise<ResultadoCambios>;

  /**
   * `dispositivos.ultima_sync_en` de este dispositivo; `null` si nunca
   * sincronizó desde que existe la columna o si la fila ya no existe (sesión
   * cerrada con el access token aún vigente).
   */
  abstract ultimaSync(dispositivoId: string): Promise<Date | null>;

  /** Marca la sync en curso. No falla si la fila ya no existe. */
  abstract registrarSync(dispositivoId: string, cuando: Date): Promise<void>;
}
