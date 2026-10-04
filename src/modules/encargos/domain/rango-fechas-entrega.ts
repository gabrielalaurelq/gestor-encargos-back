import { mismaFecha } from '../../../shared/domain/fecha';

export interface FechasPersistidas {
  entregaPrometida: Date;
  entregaAcordada: Date;
  listo: Date | null;
  entregaReal: Date | null;
}

/**
 * Value Object RangoFechasEntrega (Doc 2): agrupa las 4 fechas del Encargo
 * como una unidad, en vez de 4 campos sueltos, porque deben mantenerse
 * coherentes entre sí. Encapsula los invariantes 6-8:
 *
 * 6. `entregaPrometida` se fija al crear y **nunca** vuelve a cambiar — por eso
 *    no hay ningún método que la toque.
 * 7. `entregaAcordada` solo cambia por reprogramación explícita; es la que leen
 *    las alertas de atraso, nunca la prometida.
 * 8. `listo` y `entregaReal` solo se asignan por transición de estado, jamás a
 *    mano — de ahí que sus métodos sean `marcarListo`/`marcarEntregado` y no
 *    setters.
 *
 * Inmutable: cada cambio devuelve una instancia nueva.
 */
export class RangoFechasEntrega {
  private constructor(
    readonly entregaPrometida: Date,
    readonly entregaAcordada: Date,
    readonly listo: Date | null,
    readonly entregaReal: Date | null,
  ) {}

  /**
   * Al crear, la fecha prometida y la acordada son la misma: el primer
   * compromiso comunicado al cliente (Doc 0 §13.5). A partir de ahí divergen si
   * hay reprogramación.
   */
  static alCrear(entregaAcordada: Date): RangoFechasEntrega {
    return new RangoFechasEntrega(entregaAcordada, entregaAcordada, null, null);
  }

  static reconstituir(fechas: FechasPersistidas): RangoFechasEntrega {
    return new RangoFechasEntrega(
      fechas.entregaPrometida,
      fechas.entregaAcordada,
      fechas.listo,
      fechas.entregaReal,
    );
  }

  /** Reprogramar: mueve solo la acordada. La prometida queda como testigo. */
  reprogramar(nueva: Date): RangoFechasEntrega {
    if (mismaFecha(nueva, this.entregaAcordada)) {
      return this;
    }
    return new RangoFechasEntrega(this.entregaPrometida, nueva, this.listo, this.entregaReal);
  }

  /**
   * Al pasar a LISTO. Si ya había una fecha, se conserva: registra cuándo se
   * terminó el trabajo la primera vez, y volver a LISTO tras una pausa no
   * reescribe esa historia.
   */
  marcarListo(hoy: Date): RangoFechasEntrega {
    if (this.listo !== null) {
      return this;
    }
    return new RangoFechasEntrega(
      this.entregaPrometida,
      this.entregaAcordada,
      hoy,
      this.entregaReal,
    );
  }

  /**
   * Al pasar a ENTREGADO. Si se saltó el estado LISTO, `listo` se completa con
   * la misma fecha — PRD módulo 6: "En ese caso `fecha_listo` y
   * `fecha_entrega_real` quedan con la misma fecha".
   */
  marcarEntregado(hoy: Date): RangoFechasEntrega {
    return new RangoFechasEntrega(
      this.entregaPrometida,
      this.entregaAcordada,
      this.listo ?? hoy,
      this.entregaReal ?? hoy,
    );
  }

  /** Doc 2, alerta 6: vencida y todavía sin terminar. */
  estaAtrasado(hoy: Date): boolean {
    return this.listo === null && this.entregaAcordada.getTime() < hoy.getTime();
  }

  /** `true` si hubo reprogramación en algún momento. */
  get fueReprogramado(): boolean {
    return !mismaFecha(this.entregaPrometida, this.entregaAcordada);
  }
}
