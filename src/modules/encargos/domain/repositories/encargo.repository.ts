import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { Encargo, SumasEncargo } from '../encargo';
import { EstadoEncargo } from '../estado-encargo';

export interface FiltroEncargos {
  /** Filtros del Doc 5 Bloque 2; alimentan Dashboard, Balance y Calendario. */
  estado?: EstadoEncargo;
  fechaDesde?: Date;
  fechaHasta?: Date;
  clienteId?: string;
  pagina: number;
  porPagina: number;
}

export abstract class EncargoRepository {
  abstract buscarPorId(id: string): Promise<Encargo | null>;

  abstract listar(filtro: FiltroEncargos): Promise<PaginaResultado<Encargo>>;

  /** @throws {RecursoDuplicadoError} si el id ya existe. */
  /** @throws {EncargoNumeroEnUsoError} si el número ya está usado en el negocio. */
  abstract crear(encargo: Encargo): Promise<Encargo>;

  abstract actualizar(encargo: Encargo): Promise<Encargo>;

  /**
   * Sumas de los hijos, necesarias para recalcular los campos derivados
   * (invariantes 1-3). Hoy devuelven 0 porque no hay forma de crear Trabajos
   * ni Pagos todavía; las consultas ya son las definitivas y excluyen los
   * registros con `eliminado_en` (tombstones del Doc 4, Bloque 3).
   */
  abstract sumas(encargoId: string): Promise<SumasEncargo>;
}

export interface BloqueNumeros {
  desde: number;
  hasta: number;
}

/**
 * Contador de numeración por negocio (Doc 3, ADR-008 — patrón Hi/Lo). Vive en
 * `negocios.siguiente_bloque_numeros`, una tabla **sin RLS**, así que su
 * implementación usa `PrismaService` crudo y recibe el `negocioId` explícito —
 * igual que el repositorio de auth, y por el mismo motivo.
 */
export abstract class NumeracionRepository {
  abstract reservarBloque(negocioId: string, tamano: number): Promise<BloqueNumeros>;
}
