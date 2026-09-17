// Doc 5, Bloque 4 — rate limiting. Ventanas en milisegundos (@nestjs/throttler).
const UN_MINUTO = 60_000;

/** General: ~100 req/min por negocio autenticado (por IP si la ruta es pública).
 *  Protege contra bugs de sincronización en loop, no contra abuso malicioso. */
export const LIMITE_GENERAL = { ttl: UN_MINUTO, limit: 100 };

/** /auth/login y /auth/refresh: ~10 req/min por IP — fuerza bruta sobre el
 *  intercambio de tokens. */
export const LIMITE_AUTH = { default: { ttl: UN_MINUTO, limit: 10 } };
