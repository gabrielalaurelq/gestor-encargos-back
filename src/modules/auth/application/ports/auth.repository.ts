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

  /**
   * Fija o borra el token FCM de la fila de este dispositivo (Doc 5, Bloque 2).
   *
   * `dispositivos.fcm_token` es único **globalmente**, no por negocio. Eso es
   * correcto —un token identifica una instalación concreta de la app—, pero
   * obliga a limpiar el token de cualquier otra fila que lo tuviera antes de
   * asignarlo: Firebase reasigna el mismo token cuando la app se reinstala.
   *
   * @throws {FcmTokenEnUsoError} si el token lo tiene un dispositivo de otro
   *   negocio, que RLS no deja ver ni limpiar.
   */
  abstract fijarFcmToken(
    negocioId: string,
    dispositivoId: string,
    fcmToken: string | null,
  ): Promise<void>;
}
