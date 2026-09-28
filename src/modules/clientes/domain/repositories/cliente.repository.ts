import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { Cliente } from '../cliente';

export interface FiltroClientes {
  /** Texto libre: nombre parcial o teléfono (Doc 5 Bloque 2, Caso 8). */
  q?: string;
  pagina: number;
  porPagina: number;
}

/**
 * `crear()` la lanza cuando el id ya estaba tomado. Existe para que el caso de
 * uso pueda reaccionar sin conocer los códigos de error de Prisma (P2002) —
 * la regla de dependencias del Doc 8 Bloque 1.
 */
export class ClienteDuplicadoError extends Error {
  constructor(readonly id: string) {
    super(`Ya existe un cliente con el id ${id} en este negocio.`);
    this.name = 'ClienteDuplicadoError';
  }
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

  /** @throws {ClienteDuplicadoError} si el id ya existe. */
  abstract crear(cliente: Cliente): Promise<Cliente>;

  abstract actualizar(cliente: Cliente): Promise<Cliente>;
}
