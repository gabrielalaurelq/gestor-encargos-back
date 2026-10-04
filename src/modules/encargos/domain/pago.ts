import { randomUUID } from 'node:crypto';
import { Monto } from '../../../shared/domain/monto';
import { PagoMontoInvalidoError } from './errores';

/** Doc 4, enum `PagoTipo`. Se declara acá: `domain/` no importa Prisma. */
export enum TipoPago {
  ADELANTO = 'ADELANTO',
  PAGO = 'PAGO',
}

export interface DatosNuevoPago {
  id?: string;
  monto: number | string;
  /** Id del catálogo `origenes_pago` (Efectivo, Transferencia, Yape, Plin). */
  origenId: number;
  tipo: TipoPago;
}

/**
 * Pago: dinero recibido por un encargo (Doc 2). Dentro del agregado Encargo.
 *
 * **No tiene `aplicar()`**: un pago no se edita, solo se borra y se vuelve a
 * crear si hubo un error (Doc 5, Bloque 2), para preservar el rastro de
 * auditoría. Por eso el Doc 5 no define `PATCH`.
 *
 * `fecha` la pone el servidor y nunca es editable ni retroactiva (invariante
 * 4) — vale la misma deuda anotada en `CambiarEstadoUseCase`: con la cola
 * Outbox, un pago registrado sin conexión se fechará al sincronizar.
 */
export class Pago {
  private constructor(
    readonly id: string,
    readonly monto: Monto,
    readonly origenId: number,
    readonly tipo: TipoPago,
    readonly fecha: Date,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  static crear(datos: DatosNuevoPago, hoy: Date): Pago {
    const monto = Monto.desde(datos.monto);

    // Doc 4: CHECK monto > 0. El cero no sirve de nada y el negativo sería una
    // devolución, que el MVP no modela (se borra el pago y se registra de nuevo).
    if (monto.esCero || monto.esNegativo) {
      throw new PagoMontoInvalidoError(monto.texto);
    }

    return new Pago(datos.id ?? randomUUID(), monto, datos.origenId, datos.tipo, hoy);
  }

  static reconstituir(fila: {
    id: string;
    monto: string;
    origenId: number;
    tipo: TipoPago;
    fecha: Date;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Pago {
    return new Pago(
      fila.id,
      Monto.desde(fila.monto),
      fila.origenId,
      fila.tipo,
      fila.fecha,
      fila.creadoEn,
      fila.actualizadoEn,
    );
  }
}
