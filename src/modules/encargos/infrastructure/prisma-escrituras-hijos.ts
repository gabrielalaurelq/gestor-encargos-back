import { PagoTipo, Prisma } from '@prisma/client';
import { Monto } from '../../../shared/domain/monto';
import { RecursoDuplicadoError } from '../../../shared/domain/recurso-duplicado.error';
import { TransaccionNegocio } from '../../../shared/infrastructure/prisma/prisma-negocio';
import { Material } from '../domain/material';
import { Nota } from '../domain/nota';
import { ObjetoRecibido } from '../domain/objeto-recibido';
import { Pago } from '../domain/pago';
import { EscriturasHijos } from '../domain/repositories/encargo.repository';
import { ServicioDelCatalogo, Trabajo } from '../domain/trabajo';
import {
  CAMPOS_MATERIAL,
  CAMPOS_NOTA,
  CAMPOS_OBJETO,
  CAMPOS_PAGO,
  CAMPOS_TRABAJO,
  VIVOS,
  aMaterialDominio,
  aNotaDominio,
  aObjetoDominio,
  aPagoDominio,
  aTrabajoDominio,
} from './hijos.mapper';

const VIOLACION_UNICIDAD = 'P2002';

/**
 * Implementación de `EscriturasHijos` atada a una transacción concreta. La
 * crea `mutarAgregado()` y vive solo durante esa transacción, así que no es un
 * provider de Nest: no hay forma de inyectarla y usarla fuera de su contexto.
 *
 * Cada escritura inyecta `encargoId` —lo sabe la transacción— y `negocioId`,
 * que la extensión de `PrismaNegocio` no puede poner en los `create` anidados
 * ni, por su límite conocido, en todos los casos; se pasa explícito y el cast
 * satisface a los tipos de Prisma. NOT NULL y RLS lo respaldan.
 */
export class PrismaEscriturasHijos implements EscriturasHijos {
  constructor(
    private readonly tx: TransaccionNegocio,
    private readonly encargoId: string,
    private readonly negocioId: string,
  ) {}

  async buscarObjeto(id: string): Promise<ObjetoRecibido | null> {
    const fila = await this.tx.objetoRecibido.findFirst({
      where: { id, encargoId: this.encargoId, ...VIVOS },
      select: CAMPOS_OBJETO,
    });
    return fila ? aObjetoDominio(fila) : null;
  }

  async crearObjeto(objeto: ObjetoRecibido): Promise<ObjetoRecibido> {
    return this.conConflicto('objeto', objeto.id, async () => {
      const fila = await this.tx.objetoRecibido.create({
        data: this.conPadre({ id: objeto.id, descripcion: objeto.descripcion }),
        select: CAMPOS_OBJETO,
      });
      return aObjetoDominio(fila);
    });
  }

  async actualizarObjeto(objeto: ObjetoRecibido): Promise<ObjetoRecibido> {
    const fila = await this.tx.objetoRecibido.update({
      where: { id: objeto.id },
      data: { descripcion: objeto.descripcion },
      select: CAMPOS_OBJETO,
    });
    return aObjetoDominio(fila);
  }

  async eliminarObjeto(id: string): Promise<boolean> {
    const borrado = this.criterioVivo(id);
    const { count } = await this.tx.objetoRecibido.updateMany(borrado);
    if (count === 0) {
      return false;
    }

    // Doc 4: `fotos.objeto_recibido_id` es CASCADE y
    // `trabajos.objeto_recibido_id` es SET NULL. Con borrado lógico la base no
    // dispara ninguno de los dos hasta la purga, 90 días después, así que se
    // reproducen acá. Solo sobre filas vivas: tocar un tombstone movería su
    // `actualizado_en` y lo reenviaría por sync sin motivo.
    await Promise.all([
      this.tx.foto.updateMany({
        where: { objetoRecibidoId: id, encargoId: this.encargoId, ...VIVOS },
        data: borrado.data,
      }),
      this.tx.trabajo.updateMany({
        where: { objetoRecibidoId: id, encargoId: this.encargoId, ...VIVOS },
        data: { objetoRecibidoId: null },
      }),
    ]);
    return true;
  }

  async buscarTrabajo(id: string): Promise<Trabajo | null> {
    const fila = await this.tx.trabajo.findFirst({
      where: { id, encargoId: this.encargoId, ...VIVOS },
      select: CAMPOS_TRABAJO,
    });
    return fila ? aTrabajoDominio(fila) : null;
  }

  async crearTrabajo(trabajo: Trabajo): Promise<Trabajo> {
    return this.conConflicto('trabajo', trabajo.id, async () => {
      const fila = await this.tx.trabajo.create({
        data: this.conPadre({
          id: trabajo.id,
          servicioId: trabajo.servicioId,
          objetoRecibidoId: trabajo.objetoRecibidoId,
          descripcion: trabajo.descripcion,
          precio: trabajo.precio.texto,
        }),
        select: CAMPOS_TRABAJO,
      });
      return aTrabajoDominio(fila);
    });
  }

  async actualizarTrabajo(trabajo: Trabajo): Promise<Trabajo> {
    const fila = await this.tx.trabajo.update({
      where: { id: trabajo.id },
      // `servicioId` no se toca: la procedencia de un trabajo no cambia.
      data: {
        descripcion: trabajo.descripcion,
        precio: trabajo.precio.texto,
        objetoRecibidoId: trabajo.objetoRecibidoId,
      },
      select: CAMPOS_TRABAJO,
    });
    return aTrabajoDominio(fila);
  }

  async eliminarTrabajo(id: string): Promise<boolean> {
    const borrado = this.criterioVivo(id);
    const { count } = await this.tx.trabajo.updateMany(borrado);
    if (count === 0) {
      return false;
    }

    // Doc 4: `materiales.trabajo_id` es CASCADE. Misma marca de tiempo que el
    // trabajo, para que padre e hijos lleguen juntos en el mismo delta.
    await this.tx.material.updateMany({
      where: { trabajoId: id, ...VIVOS },
      data: borrado.data,
    });
    return true;
  }

  async buscarMaterial(trabajoId: string, id: string): Promise<Material | null> {
    const fila = await this.tx.material.findFirst({
      where: { id, ...this.deTrabajoVivo(trabajoId) },
      select: CAMPOS_MATERIAL,
    });
    return fila ? aMaterialDominio(fila) : null;
  }

  async crearMaterial(material: Material): Promise<Material> {
    return this.conConflicto('material', material.id, async () => {
      const fila = await this.tx.material.create({
        // Sin `encargoId`: `materiales` no tiene esa columna (Doc 4), cuelga
        // del trabajo. Por eso no pasa por `conPadre()`.
        data: {
          id: material.id,
          trabajoId: material.trabajoId,
          negocioId: this.negocioId,
          nombre: material.nombre,
          cantidad: material.cantidad,
          costo: material.costo?.texto ?? null,
        },
        select: CAMPOS_MATERIAL,
      });
      return aMaterialDominio(fila);
    });
  }

  async eliminarMaterial(trabajoId: string, id: string): Promise<boolean> {
    const { count } = await this.tx.material.updateMany({
      where: { id, ...this.deTrabajoVivo(trabajoId) },
      data: { eliminadoEn: new Date() },
    });
    return count > 0;
  }

  async buscarPago(id: string): Promise<Pago | null> {
    const fila = await this.tx.pago.findFirst({
      where: { id, encargoId: this.encargoId, ...VIVOS },
      select: CAMPOS_PAGO,
    });
    return fila ? aPagoDominio(fila) : null;
  }

  async crearPago(pago: Pago): Promise<Pago> {
    return this.conConflicto('pago', pago.id, async () => {
      const fila = await this.tx.pago.create({
        data: this.conPadre({
          id: pago.id,
          monto: pago.monto.texto,
          origenId: pago.origenId,
          tipo: pago.tipo as unknown as PagoTipo,
          fecha: pago.fecha,
        }),
        select: CAMPOS_PAGO,
      });
      return aPagoDominio(fila);
    });
  }

  async eliminarPago(id: string): Promise<boolean> {
    const { count } = await this.tx.pago.updateMany(this.criterioVivo(id));
    return count > 0;
  }

  async buscarNota(id: string): Promise<Nota | null> {
    // Las notas no tienen `eliminado_en`: son inmutables (invariante 16).
    const fila = await this.tx.nota.findFirst({
      where: { id, encargoId: this.encargoId },
      select: CAMPOS_NOTA,
    });
    return fila ? aNotaDominio(fila) : null;
  }

  async crearNota(nota: Nota): Promise<Nota> {
    return this.conConflicto('nota', nota.id, async () => {
      const fila = await this.tx.nota.create({
        data: this.conPadre({ id: nota.id, texto: nota.texto, fecha: nota.fecha }),
        select: CAMPOS_NOTA,
      });
      return aNotaDominio(fila);
    });
  }

  async buscarServicioActivo(servicioId: string): Promise<ServicioDelCatalogo | 'inactivo' | null> {
    const fila = await this.tx.servicio.findUnique({
      where: { id: servicioId },
      select: { id: true, nombre: true, precio: true, activo: true },
    });

    if (!fila) {
      return null;
    }
    if (!fila.activo) {
      return 'inactivo';
    }
    return { id: fila.id, nombre: fila.nombre, precio: Monto.desde(fila.precio.toString()) };
  }

  async existeOrigenPago(origenId: number): Promise<boolean> {
    // `origenes_pago` es un catálogo del sistema: sin `negocio_id` y sin RLS,
    // así que la extensión no lo filtra y se consulta directo.
    const origen = await this.tx.origenPago.findUnique({
      where: { id: origenId },
      select: { activo: true },
    });
    return origen?.activo === true;
  }

  /**
   * Material vivo cuyo trabajo también está vivo y pertenece a este encargo.
   * `materiales` no tiene `encargo_id`, así que la pertenencia al agregado se
   * comprueba a través de la relación con el trabajo.
   */
  private deTrabajoVivo(trabajoId: string) {
    return {
      trabajoId,
      ...VIVOS,
      trabajo: { encargoId: this.encargoId, ...VIVOS },
    };
  }

  /** Añade los dos campos que el hijo nunca trae del dominio. */
  private conPadre<T extends object>(datos: T) {
    return { ...datos, encargoId: this.encargoId, negocioId: this.negocioId } as T & {
      encargoId: string;
      negocioId: string;
    };
  }

  /**
   * Criterio común del soft delete (Doc 4, Bloque 3): se marca `eliminado_en`
   * en vez de borrar, para que el delta sync propague el borrado a los otros
   * dispositivos. Filtrar por encargo y por "vivo" en el `where` hace que un
   * id ajeno o ya borrado devuelva 0 filas en lugar de lanzar.
   *
   * Los tres `updateMany` van explícitos y no por un acceso dinámico al
   * modelo: Prisma genera una firma distinta por modelo y la unión no es
   * invocable, así que el atajo no tiparía.
   */
  private criterioVivo(id: string) {
    return {
      where: { id, encargoId: this.encargoId, ...VIVOS },
      data: { eliminadoEn: new Date() },
    };
  }

  /**
   * Los hijos tienen una sola restricción única —su llave primaria—, así que
   * acá sí basta con el código P2002: no hay dos candidatas que confundir,
   * como pasaba en `encargos` con `UNIQUE (negocio_id, numero)`.
   */
  private async conConflicto<T>(recurso: string, id: string, escribir: () => Promise<T>) {
    try {
      return await escribir();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === VIOLACION_UNICIDAD
      ) {
        throw new RecursoDuplicadoError(recurso, id);
      }
      throw error;
    }
  }
}
