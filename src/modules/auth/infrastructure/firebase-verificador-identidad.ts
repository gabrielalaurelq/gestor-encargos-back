import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAuth } from 'firebase-admin/auth';
import { ErrorAutenticacion } from '../../../shared/application/error-autenticacion';
import { obtenerAppFirebase } from '../../../shared/infrastructure/firebase/firebase-app';
import {
  IdentidadVerificada,
  VerificadorIdentidad,
} from '../application/ports/verificador-identidad';

const PROVEEDOR_GOOGLE = 'google.com';

// Doc 3 Bloque 4 / Doc 8 Bloque 2: validación del ID token con Firebase
// Admin SDK. La app de Firebase es la compartida con FCM y se inicializa
// perezosamente (ver `obtenerAppFirebase`).
@Injectable()
export class FirebaseVerificadorIdentidad extends VerificadorIdentidad {
  private readonly logger = new Logger(FirebaseVerificadorIdentidad.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async verificar(idToken: string): Promise<IdentidadVerificada> {
    const auth = getAuth(obtenerAppFirebase(this.config));

    let decodificado;
    try {
      // checkRevoked=false: un token revocado en Firebase sigue siendo válido
      // hasta su expiración (1 h); la sesión real la gobierna `dispositivos`.
      decodificado = await auth.verifyIdToken(idToken);
    } catch (error) {
      // Doc 8 Bloque 4: nunca se loguea el ID token — solo el motivo.
      this.logger.warn(`ID token rechazado: ${error instanceof Error ? error.message : error}`);
      throw new ErrorAutenticacion('ID_TOKEN_INVALIDO', 'El ID token de Google no es válido.');
    }

    // Doc 3 Bloque 4: el único método de login del MVP es Google Sign-In.
    if (decodificado.firebase?.sign_in_provider !== PROVEEDOR_GOOGLE) {
      throw new ErrorAutenticacion(
        'PROVEEDOR_NO_PERMITIDO',
        'Solo se admite inicio de sesión con Google.',
      );
    }

    return { googleUid: decodificado.uid, email: decodificado.email };
  }
}
