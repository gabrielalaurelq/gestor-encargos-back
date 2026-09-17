import { SesionAutenticada } from '../../../../shared/presentation/auth/sesion-autenticada';

// Puerto de emisión/verificación de tokens (Doc 3 Bloque 4: access token JWT
// de corta duración + refresh token de larga duración).
//
// Decisión (Fase 2, Bloque 2): el refresh token también es un JWT firmado,
// no un string opaco. Motivo: `dispositivos` tiene RLS forzado, y en
// /auth/refresh el backend necesita el `negocioId` ANTES de poder buscar la
// fila por hash — el JWT lo trae firmado en `sub`. El hash que se persiste
// (Doc 4 v1.3, nunca el valor plano) es SHA-256: se busca por igualdad en una
// columna única, así que necesita ser determinista (bcrypt, con sal, no sirve
// para eso; es para contraseñas de baja entropía, no para tokens aleatorios).
export abstract class ServicioTokens {
  abstract emitirAccess(sesion: SesionAutenticada): Promise<string>;
  abstract emitirRefresh(sesion: SesionAutenticada): Promise<string>;

  /** Lanza ErrorAutenticacion('TOKEN_INVALIDO' | 'TOKEN_EXPIRADO'). */
  abstract verificarAccess(token: string): Promise<SesionAutenticada>;
  /** Lanza ErrorAutenticacion('TOKEN_INVALIDO' | 'TOKEN_EXPIRADO'). */
  abstract verificarRefresh(token: string): Promise<SesionAutenticada>;

  /** Hash determinista para persistir/buscar el refresh token. */
  abstract hash(token: string): string;
}
