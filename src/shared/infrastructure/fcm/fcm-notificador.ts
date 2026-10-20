import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getMessaging } from 'firebase-admin/messaging';
import { MensajePush, Notificador, ResultadoEnvio } from '../../application/notificador';
import { obtenerAppFirebase } from '../firebase/firebase-app';

/** Tope de tokens por llamada de `sendEachForMulticast` (límite de FCM). */
const TOKENS_POR_ENVIO = 500;

/**
 * Códigos con los que FCM dice "este token ya no existe" (app desinstalada o
 * token rotado). Cualquier otro error —cuota, red, FCM caído— es pasajero: el
 * token se conserva y mañana se vuelve a intentar.
 */
const CODIGOS_TOKEN_INVALIDO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Implementación con Firebase Admin SDK (Doc 8 Bloque 3), sobre la misma app
 * de Firebase que verifica el login. Notificación con `notification` (la
 * muestra el sistema operativo aunque la app esté cerrada) más `data` para el
 * enlace al tocarla.
 */
@Injectable()
export class FcmNotificador extends Notificador {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async enviar(tokens: string[], mensaje: MensajePush): Promise<ResultadoEnvio> {
    const mensajeria = getMessaging(obtenerAppFirebase(this.config));
    let enviados = 0;
    const tokensInvalidos: string[] = [];

    for (let i = 0; i < tokens.length; i += TOKENS_POR_ENVIO) {
      const lote = tokens.slice(i, i + TOKENS_POR_ENVIO);
      const respuesta = await mensajeria.sendEachForMulticast({
        tokens: lote,
        notification: { title: mensaje.titulo, body: mensaje.cuerpo },
        data: mensaje.datos,
        android: { priority: 'high' },
      });

      enviados += respuesta.successCount;
      respuesta.responses.forEach((r, indice) => {
        if (!r.success && r.error && CODIGOS_TOKEN_INVALIDO.has(r.error.code)) {
          tokensInvalidos.push(lote[indice]);
        }
      });
    }

    return { enviados, tokensInvalidos };
  }
}
