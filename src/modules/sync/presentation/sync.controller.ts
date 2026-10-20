import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SesionActual } from '../../../shared/presentation/auth/sesion-actual.decorator';
import { SesionAutenticada } from '../../../shared/presentation/auth/sesion-autenticada';
import { SyncQuery } from '../application/dto/sync.query';
import { SincronizarUseCase } from '../application/sincronizar.use-case';
import { SyncResponse } from './sync.response';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sincronizar: SincronizarUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Devuelve todo lo cambiado en el negocio desde `since`.',
    description:
      'Pull del motor offline-first (Doc 5, Bloque 1). El push no tiene endpoint propio: la ' +
      'cola Outbox reintenta cada escritura contra los endpoints normales.\n\n' +
      '**El dispositivo debe guardar `servidor_timestamp` como su próximo `since`**, nunca el ' +
      'máximo `actualizado_en` que vio en los datos. Esa marca ya lleva un margen de solape ' +
      'hacia atrás, así que algunas filas llegan repetidas: con Last-Write-Wins aplicarlas dos ' +
      'veces da el mismo resultado, y es el precio de que no se pierda ninguna.\n\n' +
      'Las filas con `eliminado_en` viajan como cualquier otro cambio — son la señal para ' +
      'borrar en local. `fotos` llega vacía hasta el bloque de R2.',
  })
  @ApiOkResponse({ type: SyncResponse })
  @ApiResponse({
    status: 410,
    description:
      'SYNC_DEMASIADO_ANTIGUO — el `since` y la última sync de este dispositivo quedaron por ' +
      'detrás del horizonte de purga de tombstones (90 días): pudo perderse borrados. La app ' +
      'descarta lo ya sincronizado (no la cola Outbox pendiente) y repite sin `since`.',
  })
  async obtenerCambios(
    @Query() query: SyncQuery,
    @SesionActual() sesion: SesionAutenticada,
  ): Promise<SyncResponse> {
    const { servidorTimestamp, hasMore, cambios } = await this.sincronizar.execute(
      query,
      sesion.dispositivoId,
    );

    return {
      servidor_timestamp: servidorTimestamp.toISOString(),
      has_more: hasMore,
      cambios,
    };
  }
}
