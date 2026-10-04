import { Injectable } from '@nestjs/common';
import { CambiosSync, SyncRepository } from './ports/sync.repository';
import { calcularSiguienteSince } from '../domain/siguiente-since';
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
  constructor(private readonly repositorio: SyncRepository) {}

  async execute(query: SyncQuery): Promise<ResultadoSync> {
    // Se toma antes de consultar: cualquier escritura posterior tendrá un
    // `actualizado_en` más tardío y entrará en la próxima sincronización.
    const inicio = new Date();
    const since = query.since ? new Date(query.since) : null;

    const { cambios, corte } = await this.repositorio.cambiosDesde(since, LIMITE_POR_COLECCION);
    const { servidorTimestamp, hasMore } = calcularSiguienteSince({ inicio, corte });

    return { servidorTimestamp, hasMore, cambios };
  }
}
