/** Filas borradas físicamente por tabla en una corrida de la purga. */
export interface ConteoPurga {
  fotos: number;
  materiales: number;
  trabajos: number;
  objetos_recibidos: number;
  pagos: number;
}

/**
 * Puerto de los jobs programados (Doc 8, Bloque 3; Doc 10). Ninguna firma usa
 * la sesión: un job no tiene petición, así que el negocio se pasa explícito y
 * la implementación fija `app.negocio_actual` en cada transacción. **No hay
 * atajo con un rol que salte RLS** — el rol de la aplicación nunca es
 * superusuario ni `BYPASSRLS` (Doc 8 v1.1), tampoco para los jobs.
 */
export abstract class MantenimientoRepository {
  /** Ids de todos los negocios. `negocios` define al tenant y no tiene RLS. */
  abstract listarNegocios(): Promise<string[]>;

  /** Fotos con tombstone anterior a `limite`: sus ids y sus claves en R2. */
  abstract fotosPorPurgar(
    negocioId: string,
    limite: Date,
  ): Promise<{ id: string; clave: string }[]>;

  /**
   * Borra físicamente, dentro del negocio, los tombstones con `eliminado_en`
   * anterior a `limite`, más las filas de `fotoIds` (cuyos archivos ya se
   * borraron de R2). Una sola transacción por negocio.
   */
  abstract purgarTombstones(
    negocioId: string,
    limite: Date,
    fotoIds: string[],
  ): Promise<ConteoPurga>;

  /**
   * Vuelve a FREE los negocios PREMIUM cuyo `plan_vence_en` ya pasó (Doc 10,
   * Bloque 2). Devuelve cuántos cambió.
   */
  abstract revertirPlanesVencidos(ahora: Date): Promise<number>;
}
