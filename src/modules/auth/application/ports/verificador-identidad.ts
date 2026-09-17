// Puerto: valida el ID token que la app obtuvo de Google Sign-In vía Firebase
// Authentication (Doc 3 Bloque 4, Doc 5 Bloque 1 paso 2). La implementación
// real usa Firebase Admin SDK (infrastructure/); en tests se reemplaza por un
// doble, lo que permite probar login/refresh/logout sin credenciales reales.
export interface IdentidadVerificada {
  /** `uid` de Firebase Authentication — lo que persiste `negocios.google_uid`. */
  googleUid: string;
  email?: string;
}

export abstract class VerificadorIdentidad {
  /** Lanza ErrorAutenticacion('ID_TOKEN_INVALIDO' | 'PROVEEDOR_NO_PERMITIDO'). */
  abstract verificar(idToken: string): Promise<IdentidadVerificada>;
}
