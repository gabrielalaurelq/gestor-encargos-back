// Puerto de persistencia del módulo auth (Doc 8 Bloque 1: clase abstracta,
// no interfaz, para que Nest pueda inyectarla). Cubre las dos tablas que auth
// toca: `negocios` (alta implícita en el primer login, Doc 5 Bloque 1 paso 3)
// y `dispositivos` (una fila por sesión de dispositivo, Doc 4 v1.3).
export interface NegocioAutenticado {
  id: string;
  nombreNegocio: string | null;
}

export abstract class AuthRepository {
  abstract buscarOCrearNegocio(googleUid: string): Promise<NegocioAutenticado>;

  abstract crearDispositivo(
    negocioId: string,
    dispositivoId: string,
    refreshTokenHash: string,
  ): Promise<void>;

  /** true si existe la sesión y el hash coincide (Doc 5 Bloque 1 paso 5). */
  abstract existeDispositivo(
    negocioId: string,
    dispositivoId: string,
    refreshTokenHash: string,
  ): Promise<boolean>;

  /** Idempotente: no falla si la fila ya no existe. */
  abstract eliminarDispositivo(negocioId: string, dispositivoId: string): Promise<void>;
}
