import { Injectable, Logger } from '@nestjs/common';
import { Notificador } from '../../../shared/application/notificador';
import { hoyEnZonaNegocio } from '../../../shared/domain/fecha';
import { redactarAviso } from '../domain/redactar-aviso';
import { evaluarAvisos } from '../domain/reglas-recordatorio';
import { RecordatoriosRepository } from './ports/recordatorios.repository';

/** Día del resumen semanal de saldos (PRD 13: "ej. semanal"): el lunes. */
const DIA_RESUMEN_SALDOS = 1;

export interface ResumenRecordatorios {
  negocios: number;
  notificaciones: number;
  tokensSoltados: number;
  fallidos: string[];
}

/**
 * `EvaluarRecordatoriosJob` (Doc 8 Bloque 3, PRD 13): recorre los negocios,
 * evalúa las reglas 6-9 del Doc 2 y manda **una notificación por tipo** a
 * todos los dispositivos del negocio (dueño y asistentes, Doc 4).
 *
 * "Hoy" es el de Lima (`hoyEnZonaNegocio`), igual que el resto del backend:
 * con el reloj UTC del servidor, a las 9:00 de Lima ya sería el mismo día,
 * pero cualquier hora después de las 19:00 fecharía mañana.
 *
 * Un negocio que falla no detiene a los demás. Si FCM está caído no se
 * reintenta: el aviso se repite igual mañana, y el Dashboard muestra lo mismo
 * (redundancia intencional, PRD 13).
 */
@Injectable()
export class EvaluarRecordatoriosUseCase {
  private readonly logger = new Logger(EvaluarRecordatoriosUseCase.name);

  constructor(
    private readonly repositorio: RecordatoriosRepository,
    private readonly notificador: Notificador,
  ) {}

  async execute(ahora: Date = new Date()): Promise<ResumenRecordatorios> {
    const hoy = hoyEnZonaNegocio(ahora);
    // `hoy` es medianoche UTC de la fecha de Lima: su día UTC es el de Lima.
    const incluirSaldos = hoy.getUTCDay() === DIA_RESUMEN_SALDOS;
    const resumen: ResumenRecordatorios = {
      negocios: 0,
      notificaciones: 0,
      tokensSoltados: 0,
      fallidos: [],
    };

    for (const negocio of await this.repositorio.listarNegocios()) {
      resumen.negocios++;
      try {
        const { tokens, encargos } = await this.repositorio.datosParaAvisos(negocio.id);
        if (tokens.length === 0) {
          continue; // nadie a quien avisar: ni siquiera se evalúa
        }

        const avisos = evaluarAvisos(encargos, {
          hoy,
          diasNoRecoge: negocio.diasAvisoNoRecoge,
          incluirSaldos,
        });

        let vigentes = tokens;
        const invalidos: string[] = [];
        for (const aviso of avisos) {
          if (vigentes.length === 0) break;
          const envio = await this.notificador.enviar(vigentes, redactarAviso(aviso));
          resumen.notificaciones++;
          // Un token muerto no se vuelve a intentar en el siguiente aviso.
          invalidos.push(...envio.tokensInvalidos);
          vigentes = vigentes.filter((t) => !envio.tokensInvalidos.includes(t));
        }

        if (invalidos.length > 0) {
          await this.repositorio.soltarTokens(negocio.id, invalidos);
          resumen.tokensSoltados += invalidos.length;
        }
      } catch (error) {
        resumen.fallidos.push(negocio.id);
        this.logger.error({ err: error, negocioId: negocio.id }, 'Fallaron los recordatorios');
      }
    }

    this.logger.log(resumen, 'Recordatorios evaluados');
    return resumen;
  }
}
