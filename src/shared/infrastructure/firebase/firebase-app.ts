import { ConfigService } from '@nestjs/config';
import { App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';

const NOMBRE_APP = 'gestor-encargos';

/**
 * La única app de Firebase Admin del backend, compartida por la verificación
 * del login (`auth`) y el envío de notificaciones (FCM). Firebase no deja
 * inicializar dos veces una app con el mismo nombre, así que las dos tienen
 * que pasar por acá.
 *
 * Se inicializa perezosamente, en el primer uso: así el backend arranca en
 * development aunque `.env` todavía tenga las credenciales de plantilla (la
 * validación de entorno ya las rechaza en staging/producción).
 */
export function obtenerAppFirebase(config: ConfigService): App {
  if (getApps().some((app) => app.name === NOMBRE_APP)) {
    return getApp(NOMBRE_APP);
  }

  // La clave privada llega con "\n" escapados cuando se pega en un .env.
  const privateKey = config.getOrThrow<string>('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
  return initializeApp(
    {
      credential: cert({
        projectId: config.getOrThrow<string>('FIREBASE_PROJECT_ID'),
        clientEmail: config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey,
      }),
    },
    NOMBRE_APP,
  );
}
