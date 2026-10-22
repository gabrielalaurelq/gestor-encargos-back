export interface OrigenPagoCatalogo {
  id: number;
  nombre: string;
  activo: boolean;
}

/**
 * Puerto del catálogo `origenes_pago` (Doc 4, Bloque 1): una tabla del
 * sistema, sin `negocio_id` y sin RLS, igual para todos los negocios.
 */
export abstract class OrigenPagoRepository {
  /** Todos, incluidos los desactivados, ordenados por id. */
  abstract listar(): Promise<OrigenPagoCatalogo[]>;
}
