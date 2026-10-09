export interface NegocioPropio {
  id: string;
  nombreNegocio: string | null;
  plan: string;
  planVenceEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

/**
 * Puerto del agregado Negocio (Doc 2 v1.1: raíz independiente, la entidad
 * detrás de la sesión autenticada).
 *
 * Recibe el `negocioId` explícito, al contrario que los demás repositorios:
 * `negocios` es la tabla que **define** al tenant, no tiene columna
 * `negocio_id`, y por eso ni la extensión de filtrado ni RLS la alcanzan.
 * Mismo caso que `AuthRepository` y `NumeracionRepository`.
 */
export abstract class NegocioRepository {
  abstract buscarPorId(negocioId: string): Promise<NegocioPropio | null>;

  /** `nombreNegocio` en `null` lo deja sin nombre (Doc 5, Bloque 1). */
  abstract actualizarNombre(
    negocioId: string,
    nombreNegocio: string | null,
  ): Promise<NegocioPropio>;
}
