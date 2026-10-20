import { PaginaResultado } from '../../../../shared/presentation/paginacion';
import { Encargo, SumasEncargo } from '../encargo';
import { EstadoEncargo } from '../estado-encargo';
import { Foto } from '../foto';
import { Material } from '../material';
import { Nota } from '../nota';
import { ObjetoRecibido } from '../objeto-recibido';
import { Pago } from '../pago';
import { ServicioDelCatalogo, Trabajo } from '../trabajo';

export interface FiltroEncargos {
  /** Filtros del Doc 5 Bloque 2; alimentan Dashboard, Balance y Calendario. */
  estado?: EstadoEncargo;
  fechaDesde?: Date;
  fechaHasta?: Date;
  clienteId?: string;
  /**
   * Texto libre sobre `descripcion` y `ubicacion_fisica` (Búsqueda global,
   * PRD 16). No filtra por estado: un encargo entregado o cancelado también
   * se encuentra (Caso 8, incluye historial).
   */
  q?: string;
  /**
   * `compromiso` (por defecto): por fecha acordada ascendente, como se leen
   * Dashboard, Balance y Calendario. `recientes`: el más nuevo primero, que es
   * como se lee un historial (`GET /clientes/{id}/encargos`).
   */
  orden?: 'compromiso' | 'recientes';
  pagina: number;
  porPagina: number;
}

/**
 * Lectura del agregado completo (Doc 5: `GET /encargos/{id}` devuelve el
 * "detalle completo con objetos, trabajos, pagos, notas, fotos anidados").
 *
 * Los hijos van aquí y no dentro de la entidad `Encargo` a propósito: la
 * entidad solo necesita las **sumas** para sostener sus invariantes, no las
 * colecciones. Embeberlas serviría únicamente para serializar, y obligaría a
 * cargarlas en cada lectura de la raíz.
 *
 * `materiales` va plano, con su `trabajoId`: la respuesta los anida dentro de
 * cada trabajo, que es una decisión de presentación, no del dominio.
 */
export interface DetalleEncargo {
  encargo: Encargo;
  objetos: ObjetoRecibido[];
  trabajos: Trabajo[];
  materiales: Material[];
  pagos: Pago[];
  notas: Nota[];
  /** Todas, generales y de objetos, en una lista: el visor del PRD 14 las junta. */
  fotos: Foto[];
}

/**
 * Operaciones sobre los hijos, disponibles **solo** dentro de
 * `mutarAgregado()`. Es una interfaz y no una clase abstracta porque nunca se
 * inyecta: la entrega el repositorio ya atada a la transacción en curso.
 *
 * Ninguna firma recibe `encargoId` ni `negocioId`: el primero lo fija la
 * transacción de agregado, el segundo la extensión de `PrismaNegocio`.
 *
 * Las lecturas excluyen los registros con `eliminado_en` (tombstones del Doc 4
 * Bloque 3): un hijo borrado no existe para el dominio, aunque su fila siga
 * ahí para que el delta sync propague el borrado.
 */
export interface EscriturasHijos {
  buscarObjeto(id: string): Promise<ObjetoRecibido | null>;
  crearObjeto(objeto: ObjetoRecibido): Promise<ObjetoRecibido>;
  actualizarObjeto(objeto: ObjetoRecibido): Promise<ObjetoRecibido>;
  /**
   * Soft delete. `false` si no existía o ya estaba borrado. Reproduce el
   * `ON DELETE` del Doc 4 en la misma transacción: sus fotos se marcan
   * borradas (`CASCADE`) y los trabajos que lo referenciaban quedan sin objeto
   * (`SET NULL`) — para que el delta sync no entregue hijos colgando de un
   * padre borrado.
   */
  eliminarObjeto(id: string): Promise<boolean>;

  buscarTrabajo(id: string): Promise<Trabajo | null>;
  crearTrabajo(trabajo: Trabajo): Promise<Trabajo>;
  actualizarTrabajo(trabajo: Trabajo): Promise<Trabajo>;
  /** Soft delete; sus materiales se marcan borrados con él (Doc 4: `CASCADE`). */
  eliminarTrabajo(id: string): Promise<boolean>;

  /** Material vivo de un trabajo vivo de este encargo. */
  buscarMaterial(trabajoId: string, id: string): Promise<Material | null>;
  crearMaterial(material: Material): Promise<Material>;
  /** Soft delete. `false` si no existía, ya estaba borrado o es de otro trabajo. */
  eliminarMaterial(trabajoId: string, id: string): Promise<boolean>;

  buscarPago(id: string): Promise<Pago | null>;
  crearPago(pago: Pago): Promise<Pago>;
  eliminarPago(id: string): Promise<boolean>;

  buscarNota(id: string): Promise<Nota | null>;
  crearNota(nota: Nota): Promise<Nota>;

  buscarFoto(id: string): Promise<Foto | null>;
  /** Asigna la clave de R2 al persistir; la foto devuelta ya la trae. */
  crearFoto(foto: Foto): Promise<Foto>;
  /** Soft delete. El archivo en R2 lo borra la purga, cuando el tombstone ya se propagó. */
  eliminarFoto(id: string): Promise<boolean>;

  /** Servicio del catálogo, para copiar nombre y precio (invariante 12). */
  buscarServicioActivo(servicioId: string): Promise<ServicioDelCatalogo | 'inactivo' | null>;
  /** `true` si el origen existe y está activo (invariante 5). */
  existeOrigenPago(origenId: number): Promise<boolean>;
}

export interface ResultadoMutacion<T> {
  resultado: T;
  /** La raíz con los derivados ya recalculados y persistidos. */
  encargo: Encargo;
}

export abstract class EncargoRepository {
  abstract buscarPorId(id: string): Promise<Encargo | null>;

  abstract buscarDetalle(id: string): Promise<DetalleEncargo | null>;

  abstract listar(filtro: FiltroEncargos): Promise<PaginaResultado<Encargo>>;

  /** @throws {RecursoDuplicadoError} si el id ya existe. */
  /** @throws {EncargoNumeroEnUsoError} si el número ya está usado en el negocio. */
  abstract crear(encargo: Encargo): Promise<Encargo>;

  abstract actualizar(encargo: Encargo): Promise<Encargo>;

  /**
   * Sumas de los hijos vivos, necesarias para recalcular los campos derivados
   * (invariantes 1-3). Excluye los registros con `eliminado_en`.
   */
  abstract sumas(encargoId: string): Promise<SumasEncargo>;

  /**
   * **El único camino para escribir un hijo del agregado.**
   *
   * Materializa la regla de consistencia del Doc 2 ("toda escritura sobre
   * Objeto, Trabajo, Pago o Nota debe pasar por el Encargo que los contiene"):
   * abre una transacción, carga la raíz, ejecuta `fn` —que escribe el hijo— y
   * al salir **siempre** recalcula `precio_total`/`descuento`/`saldo_pendiente`
   * y los persiste, en la misma transacción.
   *
   * Que el recálculo esté acá y no en cada caso de uso es deliberado: así no
   * hay forma de escribir un hijo y olvidarse de actualizar la raíz. Si un
   * caso de uso lanza, la transacción se deshace entera.
   *
   * Devuelve `null` si el encargo no existe (o es de otro negocio, que para
   * esta sesión es lo mismo) — el caso de uso lo traduce a `404`.
   *
   * **Desvío consciente del Doc 8 Bloque 1**, que describe un único
   * `save(encargo)` que reescribe el agregado completo. Reescribir hijos que no
   * cambiaron movería su `actualizado_en`, y ese campo es justo lo que usa el
   * delta sync del Doc 5: agregar un pago haría que todos los dispositivos se
   * bajaran de nuevo todos los trabajos y objetos del encargo.
   */
  abstract mutarAgregado<T>(
    encargoId: string,
    fn: (hijos: EscriturasHijos, encargo: Encargo) => Promise<T>,
  ): Promise<ResultadoMutacion<T> | null>;
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
