import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { Cliente } from '../cliente';

export interface FiltroClientes {
  /** Texto libre: nombre parcial o teléfono (Doc 5 Bloque 2, Caso 8). */
  q?: string;
  pagina: number;
  porPagina: number;
}

/**
 * Puerto de persistencia del agregado Cliente (Doc 8, Bloque 1: clase
 * abstracta, no interfaz — TypeScript borra las interfaces al compilar y Nest
 * no podría inyectarlas). Ninguna firma recibe `negocioId`: lo aporta
 * `PrismaNegocio` desde la sesión.
 */
export abstract class ClienteRepository {
  abstract buscarPorId(id: string): Promise<Cliente | null>;

  abstract listar(filtro: FiltroClientes): Promise<PaginaResultado<Cliente>>;

  /** @throws {RecursoDuplicadoError} si el id ya existe. */
  abstract crear(cliente: Cliente): Promise<Cliente>;

  abstract actualizar(cliente: Cliente): Promise<Cliente>;
}
