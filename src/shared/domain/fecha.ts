import { DomainError } from './domain-error';

export class FechaInvalidaError extends DomainError {
  readonly codigo = 'FECHA_INVALIDA';

  constructor(campo: string, valor: unknown) {
    super(`La fecha de ${campo} debe tener el formato AAAA-MM-DD.`, { [campo]: valor });
  }
}

/**
 * Zona del negocio. Perú no usa horario de verano, así que es un desplazamiento
 * fijo (UTC-5) y no hay saltos que compensar.
 *
 * Importa porque las 4 fechas del Encargo son `DATE` sin hora (Doc 4): si el
 * servidor corriera en UTC y calculara "hoy" con su propio reloj, entre las
 * 19:00 y la medianoche de Lima asignaría el día siguiente — un encargo
 * marcado LISTO el lunes por la noche quedaría fechado el martes.
 */
export const ZONA_NEGOCIO = 'America/Lima';

const ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'en-CA' formatea como AAAA-MM-DD, que es justo lo que se necesita.
const FORMATEADOR = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Las columnas `DATE` de Postgres llegan y se escriben como `Date` a
 * medianoche UTC. Se normaliza siempre a eso para que dos fechas del mismo día
 * sean idénticas al comparar, sin arrastrar hora ni zona.
 */
export function fechaDesdeIso(texto: string, campo: string): Date {
  const partes = ISO_FECHA.exec(texto.trim());
  if (!partes) {
    throw new FechaInvalidaError(campo, texto);
  }

  const [, anio, mes, dia] = partes.map(Number) as unknown as [string, number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  // Descarta fechas imposibles que el regex sí acepta (2026-02-31): el
  // constructor las desborda al mes siguiente, así que no coinciden de vuelta.
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    throw new FechaInvalidaError(campo, texto);
  }

  return fecha;
}

export function isoDesdeFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Hoy según el calendario del negocio, a medianoche UTC. */
export function hoyEnZonaNegocio(ahora: Date = new Date()): Date {
  return fechaDesdeIso(FORMATEADOR.format(ahora), 'hoy');
}

export function mismaFecha(una: Date | null, otra: Date | null): boolean {
  if (una === null || otra === null) {
    return una === otra;
  }
  return una.getTime() === otra.getTime();
}
