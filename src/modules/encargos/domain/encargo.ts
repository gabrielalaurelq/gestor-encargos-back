import { randomUUID } from 'node:crypto';
import { fechaDesdeIso } from '../../../shared/domain/fecha';
import { Monto } from '../../../shared/domain/monto';
import {
  DescuentoInvalidoError,
  DescuentoNegativoError,
  EncargoDescripcionVaciaError,
  EncargoSinFechaError,
} from './errores';
import { EstadoEncargo, TransicionInvalidaError, puedeTransicionar } from './estado-encargo';
import { RangoFechasEntrega } from './rango-fechas-entrega';

export interface DatosNuevoEncargo {
  /** UUID generado en el dispositivo (Doc 3). */
  id?: string;
  clienteId: string;
  /** Número tomado del bloque reservado por el dispositivo; null si se agotó. */
  numero?: number | null;
  descripcion: string;
  fechaEntregaAcordada?: string;
  descuento?: number | string;
  ubicacionFisica?: string | null;
  notasGenerales?: string | null;
}

export interface CambiosEncargo {
  descripcion?: string;
  fechaEntregaAcordada?: string;
  descuento?: number | string;
  ubicacionFisica?: string | null;
  notasGenerales?: string | null;
}

/** Sumas de los agregados hijos, que el Encargo no embebe pero sí necesita. */
export interface SumasEncargo {
  trabajos: Monto;
  pagos: Monto;
}

const SIN_HIJOS: SumasEncargo = { trabajos: Monto.CERO, pagos: Monto.CERO };

/**
 * Agregado Encargo (Doc 2): la raíz del dominio. Objetos, Trabajos, Pagos y
 * Notas cuelgan de él y toda escritura sobre ellos pasa por acá (regla de
 * consistencia del Doc 2) — esos hijos llegan en Sprint 3-4.
 *
 * `precioTotal` y `saldoPendiente` son columnas denormalizadas (Doc 4, Bloque
 * 4), no vistas calculadas: el backend las recalcula y escribe cada vez que
 * cambia un Trabajo, el descuento o un Pago. Acá se mantienen como campos y
 * `recalcular()` es el único sitio que los deriva.
 */
export class Encargo {
  private constructor(
    readonly id: string,
    readonly clienteId: string,
    private _numero: number | null,
    private _descripcion: string,
    private _estado: EstadoEncargo,
    private _precioTotal: Monto,
    private _descuento: Monto,
    private _saldoPendiente: Monto,
    private _fechas: RangoFechasEntrega,
    private _ubicacionFisica: string | null,
    private _notasGenerales: string | null,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  /** Doc 2, invariante 9: todo Encargo nuevo nace INGRESADO. */
  static crear(datos: DatosNuevoEncargo): Encargo {
    if (!datos.fechaEntregaAcordada) {
      throw new EncargoSinFechaError();
    }

    const descuento = Encargo.validarDescuento(datos.descuento ?? 0);
    // Sin Trabajos todavía, la suma es 0 y cualquier descuento positivo
    // rompería el invariante 2. Se comprueba igual, no se da por hecho.
    Encargo.comprobarDescuento(descuento, SIN_HIJOS.trabajos);

    return new Encargo(
      datos.id ?? randomUUID(),
      datos.clienteId,
      datos.numero ?? null,
      Encargo.validarDescripcion(datos.descripcion),
      EstadoEncargo.INGRESADO,
      Monto.CERO,
      descuento,
      Monto.CERO,
      RangoFechasEntrega.alCrear(fechaDesdeIso(datos.fechaEntregaAcordada, 'entrega acordada')),
      Encargo.limpiarOpcional(datos.ubicacionFisica),
      Encargo.limpiarOpcional(datos.notasGenerales),
    );
  }

  static reconstituir(fila: {
    id: string;
    clienteId: string;
    numero: number | null;
    descripcion: string;
    estado: EstadoEncargo;
    precioTotal: string;
    descuento: string;
    saldoPendiente: string;
    fechaEntregaPrometida: Date;
    fechaEntregaAcordada: Date;
    fechaListo: Date | null;
    fechaEntregaReal: Date | null;
    ubicacionFisica: string | null;
    notasGenerales: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Encargo {
    return new Encargo(
      fila.id,
      fila.clienteId,
      fila.numero,
      fila.descripcion,
      fila.estado,
      Monto.desde(fila.precioTotal),
      Monto.desde(fila.descuento),
      Monto.desde(fila.saldoPendiente),
      RangoFechasEntrega.reconstituir({
        entregaPrometida: fila.fechaEntregaPrometida,
        entregaAcordada: fila.fechaEntregaAcordada,
        listo: fila.fechaListo,
        entregaReal: fila.fechaEntregaReal,
      }),
      fila.ubicacionFisica,
      fila.notasGenerales,
      fila.creadoEn,
      fila.actualizadoEn,
    );
  }

  get numero(): number | null {
    return this._numero;
  }

  get descripcion(): string {
    return this._descripcion;
  }

  get estado(): EstadoEncargo {
    return this._estado;
  }

  get precioTotal(): Monto {
    return this._precioTotal;
  }

  get descuento(): Monto {
    return this._descuento;
  }

  get saldoPendiente(): Monto {
    return this._saldoPendiente;
  }

  get fechas(): RangoFechasEntrega {
    return this._fechas;
  }

  get ubicacionFisica(): string | null {
    return this._ubicacionFisica;
  }

  get notasGenerales(): string | null {
    return this._notasGenerales;
  }

  /**
   * PATCH parcial (Doc 5, Bloque 2): descripción, reprogramación, descuento,
   * ubicación física y notas generales. El estado NO se toca acá — tiene su
   * propio endpoint porque dispara efectos automáticos.
   *
   * `sumas` hace falta porque cambiar el descuento obliga a recalcular
   * `precioTotal` (invariante 1) y a comprobar el invariante 2.
   */
  aplicar(cambios: CambiosEncargo, sumas: SumasEncargo = SIN_HIJOS): boolean {
    let cambio = false;

    if (cambios.descripcion !== undefined) {
      const descripcion = Encargo.validarDescripcion(cambios.descripcion);
      if (descripcion !== this._descripcion) {
        this._descripcion = descripcion;
        cambio = true;
      }
    }

    if (cambios.fechaEntregaAcordada !== undefined) {
      const fechas = this._fechas.reprogramar(
        fechaDesdeIso(cambios.fechaEntregaAcordada, 'entrega acordada'),
      );
      if (fechas !== this._fechas) {
        this._fechas = fechas;
        cambio = true;
      }
    }

    if (cambios.descuento !== undefined) {
      const descuento = Encargo.validarDescuento(cambios.descuento);
      // Un descuento que el usuario fija a mano por encima de la suma se
      // rechaza (invariante 2 vía Doc 5: DESCUENTO_INVALIDO). Distinto del
      // ajuste automático de `recalcular()`, que ocurre cuando la suma baja
      // sola al borrarse un Trabajo.
      Encargo.comprobarDescuento(descuento, sumas.trabajos);
      if (!descuento.equals(this._descuento)) {
        this._descuento = descuento;
        this.recalcular(sumas);
        cambio = true;
      }
    }

    if (cambios.ubicacionFisica !== undefined) {
      const valor = Encargo.limpiarOpcional(cambios.ubicacionFisica);
      if (valor !== this._ubicacionFisica) {
        this._ubicacionFisica = valor;
        cambio = true;
      }
    }

    if (cambios.notasGenerales !== undefined) {
      const valor = Encargo.limpiarOpcional(cambios.notasGenerales);
      if (valor !== this._notasGenerales) {
        this._notasGenerales = valor;
        cambio = true;
      }
    }

    return cambio;
  }

  /**
   * Cambia el estado y dispara sus efectos (Doc 2, reglas 3-4).
   * Devuelve las advertencias no bloqueantes que la app debe mostrar.
   */
  transicionarA(estado: EstadoEncargo, hoy: Date): AdvertenciaEncargo[] {
    if (estado === this._estado) {
      return [];
    }
    if (!puedeTransicionar(this._estado, estado)) {
      throw new TransicionInvalidaError(this._estado, estado);
    }

    const advertencias: AdvertenciaEncargo[] = [];

    if (estado === EstadoEncargo.LISTO) {
      this._fechas = this._fechas.marcarListo(hoy);
    }

    if (estado === EstadoEncargo.ENTREGADO) {
      // Si se saltó LISTO, ambas fechas quedan iguales (PRD módulo 6).
      this._fechas = this._fechas.marcarEntregado(hoy);

      // Doc 2, invariante 10: entregar con saldo pendiente se permite —
      // vender fiado es parte del negocio—, solo se advierte.
      if (this._saldoPendiente.mayorQue(Monto.CERO)) {
        advertencias.push({
          codigo: 'SALDO_PENDIENTE',
          mensaje: `Queda un saldo pendiente de S/ ${this._saldoPendiente.texto}.`,
          detalles: { saldo_pendiente: this._saldoPendiente.soles },
        });
      }
    }

    this._estado = estado;
    return advertencias;
  }

  /** Asigna el número cuando el dispositivo lo obtiene tras sincronizar. */
  asignarNumero(numero: number): void {
    this._numero = numero;
  }

  /**
   * Invariantes 1-3, el único sitio donde se derivan los tres campos
   * calculados. Lo llamarán los casos de uso de Trabajos y Pagos (Sprint 3-4)
   * dentro de la misma transacción que modifica el hijo.
   *
   * Si la suma de trabajos baja por debajo del descuento vigente, el descuento
   * **se ajusta solo** (invariante 2, segunda mitad) — acá no se lanza error:
   * el usuario no pidió este cambio, lo provocó borrar un trabajo, y bloquearlo
   * dejaría el encargo en un estado imposible de arreglar.
   */
  recalcular(sumas: SumasEncargo): void {
    if (this._descuento.mayorQue(sumas.trabajos)) {
      this._descuento = sumas.trabajos;
    }
    this._precioTotal = sumas.trabajos.restar(this._descuento);
    // Invariante 3: puede quedar negativo (saldo a favor del cliente) y nunca
    // se lleva a 0 artificialmente.
    this._saldoPendiente = this._precioTotal.restar(sumas.pagos);
  }

  private static validarDescripcion(descripcion: string): string {
    const limpia = descripcion.trim();
    if (limpia === '') {
      throw new EncargoDescripcionVaciaError();
    }
    return limpia;
  }

  private static validarDescuento(valor: number | string): Monto {
    const descuento = Monto.desde(valor);
    if (descuento.esNegativo) {
      throw new DescuentoNegativoError(descuento.texto);
    }
    return descuento;
  }

  private static comprobarDescuento(descuento: Monto, sumaTrabajos: Monto): void {
    if (descuento.mayorQue(sumaTrabajos)) {
      throw new DescuentoInvalidoError(descuento.texto, sumaTrabajos.texto);
    }
  }

  private static limpiarOpcional(valor: string | null | undefined): string | null {
    if (valor === null || valor === undefined) {
      return null;
    }
    const limpio = valor.trim();
    return limpio === '' ? null : limpio;
  }
}

export interface AdvertenciaEncargo {
  codigo: string;
  mensaje: string;
  detalles?: Record<string, unknown>;
}
