import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { ErrorAutenticacion } from '../../../shared/application/error-autenticacion';
import {
  IdentidadVerificada,
  VerificadorIdentidad,
} from '../application/ports/verificador-identidad';

const NOMBRE_APP = 'gestor-encargos';
const PROVEEDOR_GOOGLE = 'google.com';

// Doc 3 Bloque 4 / Doc 8 Bloque 2: validación del ID token con Firebase
// Admin SDK. La app de Firebase se inicializa perezosamente, en el primer
// login: así el backend arranca en development aunque `.env` todavía tenga
// las credenciales de plantilla (la validación de entorno ya las rechaza en
// staging/producción).
@Injectable()
export class FirebaseVerificadorIdentidad extends VerificadorIdentidad {
  private readonly logger = new Logger(FirebaseVerificadorIdentidad.name);
  private app?: App;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async verificar(idToken: string): Promise<IdentidadVerificada> {
    const auth = getAuth(this.obtenerApp());

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

  private obtenerApp(): App {
    if (this.app) return this.app;
    if (getApps().some((app) => app.name === NOMBRE_APP)) {
      this.app = getApp(NOMBRE_APP);
      return this.app;
    }

    // La clave privada llega con "\n" escapados cuando se pega en un .env.
    const privateKey = this.config.getOrThrow<string>('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
    this.app = initializeApp(
      {
        credential: cert({
          projectId: this.config.getOrThrow<string>('FIREBASE_PROJECT_ID'),
          clientEmail: this.config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL'),
          privateKey,
        }),
      },
      NOMBRE_APP,
    );
    return this.app;
  }
}
