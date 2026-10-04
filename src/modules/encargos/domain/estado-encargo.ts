import { DomainError } from '../../../shared/domain/domain-error';

/**
 * Estados del Encargo (PRD módulo 6, Doc 4 enum `EncargoEstado`). Se declara
 * acá y no se importa de `@prisma/client` porque la capa `domain/` no puede
 * depender de Prisma (Doc 8, Bloque 1); los valores coinciden uno a uno y el
 * repositorio hace de puente.
 */
export enum EstadoEncargo {
  INGRESADO = 'INGRESADO',
  EN_PROCESO = 'EN_PROCESO',
  LISTO = 'LISTO',
  ENTREGADO = 'ENTREGADO',
  PAUSADO = 'PAUSADO',
  CANCELADO = 'CANCELADO',
}

export class TransicionInvalidaError extends DomainError {
  readonly codigo = 'TRANSICION_INVALIDA';

  constructor(desde: EstadoEncargo, hasta: EstadoEncargo) {
    super(`Un encargo ${desde} no puede pasar a ${hasta}.`, { desde, hasta });
  }
}

/**
 * Estados en los que el encargo sigue vivo. Los otros dos son finales, pero
 * de distinta manera: CANCELADO es reversible a propósito (PRD módulo 6:
 * "puede reactivarse manualmente a su estado anterior si fue un error"),
 * ENTREGADO no lo es.
 */
const ACTIVOS: readonly EstadoEncargo[] = [
  EstadoEncargo.INGRESADO,
  EstadoEncargo.EN_PROCESO,
  EstadoEncargo.LISTO,
  EstadoEncargo.PAUSADO,
];

/**
 * Tabla de transiciones. Reglas de los documentos:
 *
 * - Los 4 secuenciales admiten **saltos** (PRD módulo 6: "Intento de marcar
 *   ENTREGADO un encargo que sigue INGRESADO → se permite; no todos los
 *   negocios necesitan pasar por cada estado").
 * - PAUSADO y CANCELADO se alcanzan desde cualquier estado activo (Doc 2,
 *   invariante 11), y desde ellos se vuelve a cualquier estado activo — que es
 *   la reactivación "a su estado anterior" del PRD: el estado destino lo elige
 *   quien llama, por eso no hace falta guardar cuál era.
 * - **ENTREGADO es terminal**: el PRD acota pausar y cancelar a "en cualquier
 *   momento antes de ENTREGADO" y "cualquier encargo no entregado". Ningún
 *   documento define cómo deshacer una entrega. Es la lectura literal y la
 *   más restrictiva; revisable si la UI lo necesita.
 */
const TRANSICIONES: Readonly<Record<EstadoEncargo, readonly EstadoEncargo[]>> = {
  [EstadoEncargo.INGRESADO]: [
    EstadoEncargo.EN_PROCESO,
    EstadoEncargo.LISTO,
    EstadoEncargo.ENTREGADO,
    EstadoEncargo.PAUSADO,
    EstadoEncargo.CANCELADO,
  ],
  [EstadoEncargo.EN_PROCESO]: [
    EstadoEncargo.LISTO,
    EstadoEncargo.ENTREGADO,
    EstadoEncargo.PAUSADO,
    EstadoEncargo.CANCELADO,
  ],
  [EstadoEncargo.LISTO]: [EstadoEncargo.ENTREGADO, EstadoEncargo.PAUSADO, EstadoEncargo.CANCELADO],
  [EstadoEncargo.PAUSADO]: [
    EstadoEncargo.INGRESADO,
    EstadoEncargo.EN_PROCESO,
    EstadoEncargo.LISTO,
    EstadoEncargo.ENTREGADO,
    EstadoEncargo.CANCELADO,
  ],
  [EstadoEncargo.CANCELADO]: ACTIVOS,
  [EstadoEncargo.ENTREGADO]: [],
};

export function esActivo(estado: EstadoEncargo): boolean {
  return ACTIVOS.includes(estado);
}

export function puedeTransicionar(desde: EstadoEncargo, hasta: EstadoEncargo): boolean {
  return TRANSICIONES[desde].includes(hasta);
}

/**
 * Doc 2, regla 10 / PRD módulo 6: un Encargo cuenta en Balance de Carga y
 * Calendario mientras esté activo; deja de contar si es ENTREGADO o CANCELADO.
 * Un PAUSADO sí cuenta — el compromiso con el cliente sigue existiendo.
 */
export const ESTADOS_QUE_CUENTAN_EN_AGENDA = ACTIVOS;
