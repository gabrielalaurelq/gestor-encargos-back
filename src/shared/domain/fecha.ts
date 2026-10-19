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

const MS_POR_DIA = 86_400_000;

/**
 * Un día de tolerancia hacia el futuro: absorbe el desfase de zona horaria y
 * un reloj de móvil ligeramente adelantado. Más que esto ya sería aceptar una
 * fecha inventada.
 */
export const TOLERANCIA_FUTURO_DIAS = 1;

/**
 * Ventana hacia el pasado. Una cola Outbox no sobrevive tanto en la práctica, y
 * es el mismo horizonte que la purga de tombstones del Doc 4 Bloque 3.
 *
 * No se acota contra la creación del encargo —que sería lo natural— porque
 * `creado_en` lo pone el servidor: un encargo creado sin conexión tendría
 * `creado_en` **posterior** a la fecha real de su propio pago, y rechazaría
 * cosas legítimas.
 */
export const VENTANA_PASADO_DIAS = 90;

export class FechaFueraDeRangoError extends DomainError {
  readonly codigo = 'FECHA_FUERA_DE_RANGO';

  constructor(campo: string, valor: string, desde: Date, hasta: Date) {
    super(`La fecha de ${campo} está fuera del rango aceptado.`, {
      [campo]: valor,
      rango_aceptado: { desde: isoDesdeFecha(desde), hasta: isoDesdeFecha(hasta) },
    });
  }
}

/**
 * Resuelve la fecha de un **hecho del negocio** (`pago.fecha`, `fecha_listo`,
 * `fecha_entrega_real`, `nota.fecha`).
 *
 * **La pone el dispositivo**, como dicen el Doc 2 (invariante 4, reglas 3-4) y
 * el PRD (módulo 5): son hechos del mundo real, y el dispositivo es quien sabe
 * cuándo ocurrieron — el servidor solo sabe cuándo se enteró. Importa por la
 * cola Outbox del Doc 3: un pago registrado sin conexión el lunes y
 * sincronizado el miércoles tiene que quedar fechado el lunes, porque la Caja
 * diaria (PRD módulo 12) agrupa por fecha.
 *
 * Si el cuerpo no la trae, se usa el reloj del servidor: así la API sigue
 * siendo usable desde Swagger o `curl`.
 *
 * **Distinción que no está en ningún documento y conviene no perder:** esto
 * aplica solo a los hechos del negocio. `creado_en` y `actualizado_en` son
 * maquinaria del motor de sincronización y los fija **siempre** el servidor —
 * si el cliente pudiera fijar `actualizado_en`, un teléfono con el reloj
 * adelantado ganaría todos los conflictos de Last-Write-Wins para siempre.
 *
 * Que la fecha sea falsificable por el dueño del negocio sobre sus propios
 * datos es aceptado: no hay riesgo entre negocios (RLS y el `negocioId` de la
 * sesión lo impiden), y falsear tus propias fechas es un problema de tu
 * contabilidad, no de seguridad.
 */
export function resolverFechaDeHecho(
  fechaIso: string | undefined | null,
  campo: string,
  ahora: Date = new Date(),
): Date {
  const hoy = hoyEnZonaNegocio(ahora);
  if (fechaIso === undefined || fechaIso === null) {
    return hoy;
  }

  const fecha = fechaDesdeIso(fechaIso, campo);
  const desde = new Date(hoy.getTime() - VENTANA_PASADO_DIAS * MS_POR_DIA);
  const hasta = new Date(hoy.getTime() + TOLERANCIA_FUTURO_DIAS * MS_POR_DIA);

  if (fecha.getTime() < desde.getTime() || fecha.getTime() > hasta.getTime()) {
    throw new FechaFueraDeRangoError(campo, fechaIso, desde, hasta);
  }

  return fecha;
}
