/**
 * Reglas de los recordatorios (Doc 2 reglas 6-9, PRD módulo 13). Funciones
 * puras: reciben los encargos y "hoy", devuelven qué avisar. Ni base ni FCM —
 * así cada regla se prueba con fechas fijas, sin esperar al reloj.
 */

export enum TipoAviso {
  ENTREGA_HOY = 'ENTREGA_HOY',
  ENTREGA_MANANA = 'ENTREGA_MANANA',
  ATRASADO = 'ATRASADO',
  NO_RECOGE = 'NO_RECOGE',
  SALDO_PENDIENTE = 'SALDO_PENDIENTE',
}

/** Lo mínimo de un encargo para evaluar y redactar avisos. */
export interface EncargoParaAviso {
  id: string;
  numero: number | null;
  descripcion: string;
  cliente: string;
  estado: string;
  /** Fechas `DATE` a medianoche UTC, como en todo el backend. */
  fechaEntregaAcordada: Date;
  fechaListo: Date | null;
  fechaEntregaReal: Date | null;
  /** Saldo en céntimos (entero, sin error binario). */
  saldoCentimos: number;
}

export interface Aviso {
  tipo: TipoAviso;
  encargos: EncargoParaAviso[];
}

export interface ContextoEvaluacion {
  hoy: Date;
  /** Umbral de "Cliente no recoge" del negocio (PRD 13, Ajustes). */
  diasNoRecoge: number;
  /** El resumen de saldos es semanal (PRD 13): solo el día que toca. */
  incluirSaldos: boolean;
}

const MS_POR_DIA = 86_400_000;

/**
 * Estados que no avisan de entrega, atraso ni recojo:
 * - ENTREGADO y CANCELADO: ya no hay nada que hacer.
 * - **PAUSADO** (decisión del usuario): pausar es una decisión consciente
 *   —p. ej. se espera material del cliente—, y un "atrasado" diario sobre algo
 *   pausado a propósito es ruido que hace ignorar las alertas reales. Sigue
 *   contando en Balance de Carga y Calendario, que lo calculan en la app.
 */
const SIN_AVISOS = new Set(['ENTREGADO', 'CANCELADO', 'PAUSADO']);

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
}

/**
 * Qué avisos tocan hoy, **ya agrupados por tipo** (Doc 2 regla 9: "varias
 * alertas del mismo tipo el mismo día se agrupan en una sola notificación").
 * Solo aparecen los tipos con al menos un encargo.
 *
 * Se repiten cada día mientras la condición siga: el PRD dice que "Trabajo
 * atrasado" "deja de enviarse en cuanto se marca LISTO", no que se mande una
 * sola vez. Por eso no hace falta guardar qué se avisó.
 */
export function evaluarAvisos(encargos: EncargoParaAviso[], contexto: ContextoEvaluacion): Aviso[] {
  const { hoy, diasNoRecoge, incluirSaldos } = contexto;
  const grupos = new Map<TipoAviso, EncargoParaAviso[]>();
  const agregar = (tipo: TipoAviso, encargo: EncargoParaAviso) =>
    grupos.set(tipo, [...(grupos.get(tipo) ?? []), encargo]);

  for (const encargo of encargos) {
    if (incluirSaldos && encargo.estado === 'ENTREGADO' && encargo.saldoCentimos > 0) {
      agregar(TipoAviso.SALDO_PENDIENTE, encargo);
    }
    if (SIN_AVISOS.has(encargo.estado)) {
      continue;
    }

    // Regla 8, sobre la fecha **acordada** (regla 7): reprogramar recalcula.
    // Incluye los LISTO: que esté terminado no quita que el cliente venga hoy.
    const faltan = diasEntre(hoy, encargo.fechaEntregaAcordada);
    if (faltan === 0) {
      agregar(TipoAviso.ENTREGA_HOY, encargo);
    } else if (faltan === 1) {
      agregar(TipoAviso.ENTREGA_MANANA, encargo);
    }

    // Regla 6: atrasado mientras no esté listo.
    if (faltan < 0 && encargo.fechaListo === null) {
      agregar(TipoAviso.ATRASADO, encargo);
    }

    // Regla 7: listo hace N días o más y sin entregar.
    if (
      encargo.fechaListo !== null &&
      encargo.fechaEntregaReal === null &&
      diasEntre(encargo.fechaListo, hoy) >= diasNoRecoge
    ) {
      agregar(TipoAviso.NO_RECOGE, encargo);
    }
  }

  return [...grupos].map(([tipo, lista]) => ({ tipo, encargos: lista }));
}
