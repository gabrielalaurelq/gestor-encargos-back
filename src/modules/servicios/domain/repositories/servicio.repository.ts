import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { Servicio } from '../servicio';

export interface FiltroServicios {
  /** Por defecto solo los activos (Doc 5, Bloque 2). */
  incluirInactivos: boolean;
  pagina: number;
  porPagina: number;
}

/** Puerto de persistencia del agregado Servicio (Doc 8, Bloque 1). */
export abstract class ServicioRepository {
  abstract buscarPorId(id: string): Promise<Servicio | null>;

  abstract listar(filtro: FiltroServicios): Promise<PaginaResultado<Servicio>>;

  /** @throws {RecursoDuplicadoError} si el id ya existe. */
  abstract crear(servicio: Servicio): Promise<Servicio>;

  abstract actualizar(servicio: Servicio): Promise<Servicio>;
}
