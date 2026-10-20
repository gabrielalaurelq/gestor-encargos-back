import { Monto } from '../../../shared/domain/monto';
import { MensajePush } from '../../../shared/application/notificador';
import { Aviso, EncargoParaAviso, TipoAviso } from './reglas-recordatorio';

/**
 * Texto de cada notificación. Público de más de 50 años (Doc 6): frases
 * cortas, sin jerga, el dato que importa primero. Con un solo encargo se
 * nombra —"#12 · Vestido rojo — Ana García"— y tocarla abre ese encargo; con
 * varios, un resumen ("Tienes 3 trabajos atrasados") que abre la lista.
 */
const TITULOS: Record<TipoAviso, string> = {
  [TipoAviso.ENTREGA_HOY]: 'Entrega hoy',
  [TipoAviso.ENTREGA_MANANA]: 'Entrega mañana',
  [TipoAviso.ATRASADO]: 'Trabajo atrasado',
  [TipoAviso.NO_RECOGE]: 'Cliente no recoge',
  [TipoAviso.SALDO_PENDIENTE]: 'Saldo pendiente',
};

const VARIOS: Record<TipoAviso, (n: number) => string> = {
  [TipoAviso.ENTREGA_HOY]: (n) => `Tienes ${n} entregas para hoy`,
  [TipoAviso.ENTREGA_MANANA]: (n) => `Tienes ${n} entregas para mañana`,
  [TipoAviso.ATRASADO]: (n) => `Tienes ${n} trabajos atrasados`,
  [TipoAviso.NO_RECOGE]: (n) => `${n} clientes todavía no recogen su trabajo`,
  [TipoAviso.SALDO_PENDIENTE]: (n) => `Te deben dinero de ${n} encargos entregados`,
};

/** "#12 · Vestido rojo — Ana García". Sin número todavía (Hi/Lo) se omite. */
function referencia(encargo: EncargoParaAviso): string {
  const numero = encargo.numero === null ? '' : `#${encargo.numero} · `;
  return `${numero}${encargo.descripcion} — ${encargo.cliente}`;
}

function soles(centimos: number): string {
  return `S/${Monto.desdeCentimos(centimos).texto}`;
}

export function redactarAviso(aviso: Aviso): MensajePush {
  const { tipo, encargos } = aviso;
  const titulo = TITULOS[tipo];

  if (encargos.length === 1) {
    const [encargo] = encargos;
    const cuerpo =
      tipo === TipoAviso.SALDO_PENDIENTE
        ? `${encargo.cliente} te debe ${soles(encargo.saldoCentimos)} (${referencia(encargo)})`
        : referencia(encargo);
    return { titulo, cuerpo, datos: { tipo, encargo_id: encargo.id } };
  }

  let cuerpo = VARIOS[tipo](encargos.length);
  if (tipo === TipoAviso.SALDO_PENDIENTE) {
    const total = encargos.reduce((suma, e) => suma + e.saldoCentimos, 0);
    cuerpo += `: ${soles(total)} en total`;
  }
  return { titulo, cuerpo, datos: { tipo } };
}
