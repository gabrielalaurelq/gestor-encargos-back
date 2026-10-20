import { EncargoParaAviso } from '../../domain/reglas-recordatorio';

export interface NegocioParaAvisos {
  id: string;
  diasAvisoNoRecoge: number;
}

export interface DatosAvisos {
  /** `fcm_token` de los dispositivos del negocio que tienen uno. */
  tokens: string[];
  /** Candidatos: no cancelados, y sin entregar o entregados con saldo. */
  encargos: EncargoParaAviso[];
}

/**
 * Puerto de `EvaluarRecordatoriosJob`. Como en los jobs de mantenimiento, sin
 * sesión: el negocio va explícito y cada lectura fija `app.negocio_actual`
 * (RLS activo). `negocios` no tiene RLS; `dispositivos` y `encargos`, sí.
 */
export abstract class RecordatoriosRepository {
  abstract listarNegocios(): Promise<NegocioParaAvisos[]>;

  abstract datosParaAvisos(negocioId: string): Promise<DatosAvisos>;

  /**
   * Pone en `null` los tokens que FCM dio por inválidos, **sin tocar la
   * sesión** de esa fila (Doc 8 Bloque 3): el dispositivo sigue logueado.
   */
  abstract soltarTokens(negocioId: string, tokens: string[]): Promise<void>;
}
