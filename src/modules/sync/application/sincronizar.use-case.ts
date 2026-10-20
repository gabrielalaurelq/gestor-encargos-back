import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AlmacenamientoFotos } from '../../../shared/application/almacenamiento-fotos';
import { limiteRetencion } from '../../../shared/domain/retencion-tombstones';
import { CambiosSync, FilaSync, SyncRepository } from './ports/sync.repository';
import { calcularSiguienteSince } from '../domain/siguiente-since';
import { syncVigente } from '../domain/sync-vigente';
import { SyncQuery } from './dto/sync.query';

/**
 * Tope de filas por colección. El volumen por negocio es pequeño (Doc 0 §12.3:
 * ~200 clientes, ~100 encargos activos), así que el truncamiento es para el
 * caso raro que el propio Doc 5 menciona: "negocio con mucho historial
 * resincronizando".
 *
 * **Límite conocido:** si un solo lote de 500 filas compartiera exactamente el
 * mismo `actualizado_en`, el corte no avanzaría y el cliente giraría en vacío.
 * No puede pasar hoy porque no hay ninguna escritura masiva —cada fila se crea
 * en su propia operación, con su propia marca—; si alguna vez se añade una,
 * habrá que pasar a un cursor compuesto `(actualizado_en, id)`.
 */
export const LIMITE_POR_COLECCION = 500;

export interface ResultadoSync {
  servidorTimestamp: Date;
  hasMore: boolean;
  cambios: CambiosSync;
}

/** `GET /sync?since=` (Doc 5, Bloque 1). */
@Injectable()
export class SincronizarUseCase {
  constructor(
    private readonly repositorio: SyncRepository,
    private readonly almacenamiento: AlmacenamientoFotos,
  ) {}

  async execute(query: SyncQuery, dispositivoId: string): Promise<ResultadoSync> {
    // Se toma antes de consultar: cualquier escritura posterior tendrá un
    // `actualizado_en` más tardío y entrará en la próxima sincronización.
    const inicio = new Date();
    const since = query.since ? new Date(query.since) : null;

    // El 410 va antes de marcar la sync: si se marcara primero, un cliente que
    // reintentara el mismo `since` viejo pasaría la segunda vez.
    const ultimaSync = await this.repositorio.ultimaSync(dispositivoId);
    if (!syncVigente({ since, ultimaSync, ahora: inicio })) {
      throw new HttpException(
        {
          codigo: 'SYNC_DEMASIADO_ANTIGUO',
          mensaje:
            'Este dispositivo no sincroniza hace demasiado tiempo. Descarte los datos locales ' +
            'ya sincronizados y vuelva a pedir el estado completo, sin `since`.',
          detalles: { since_minimo: limiteRetencion(inicio).toISOString() },
        },
        HttpStatus.GONE,
      );
    }
    await this.repositorio.registrarSync(dispositivoId, inicio);

    const { cambios, corte } = await this.repositorio.cambiosDesde(since, LIMITE_POR_COLECCION);
    const { servidorTimestamp, hasMore } = calcularSiguienteSince({ inicio, corte });
    cambios.fotos = await Promise.all(cambios.fotos.map((fila) => this.conUrlDescarga(fila)));

    return { servidorTimestamp, hasMore, cambios };
  }

  /**
   * La clave de R2 es interna: el cliente recibe una URL de descarga firmada
   * (bucket privado). Un tombstone no la necesita — es la señal para borrar en
   * local, no hay nada que bajar.
   */
  private async conUrlDescarga(fila: FilaSync): Promise<FilaSync> {
    const { clave, ...resto } = fila;
    if (fila.eliminado_en !== null) {
      return { ...resto, url_descarga: null, url_descarga_expira_en: null };
    }
    const { url, expiraEn } = await this.almacenamiento.urlDescarga(clave as string);
    return { ...resto, url_descarga: url, url_descarga_expira_en: expiraEn.toISOString() };
  }
}
