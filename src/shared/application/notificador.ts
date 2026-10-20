export interface MensajePush {
  titulo: string;
  cuerpo: string;
  /**
   * Datos para la app al tocar la notificación (PRD 13: abrir el encargo, o
   * la lista correspondiente). FCM solo admite valores string.
   */
  datos: Record<string, string>;
}

export interface ResultadoEnvio {
  enviados: number;
  /** Tokens que FCM declaró inválidos (app desinstalada): hay que soltarlos. */
  tokensInvalidos: string[];
}

/**
 * Puerto del envío de notificaciones push (Doc 8 Bloque 3:
 * `NotificacionesService`, Firebase Cloud Messaging). Solo envía y **avisa**
 * qué tokens ya no sirven; limpiarlos de `dispositivos` es cosa de quien
 * llama, que sí tiene el negocio y la transacción.
 */
export abstract class Notificador {
  abstract enviar(tokens: string[], mensaje: MensajePush): Promise<ResultadoEnvio>;
}
