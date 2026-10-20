import { Injectable, Logger } from '@nestjs/common';
import { AlmacenamientoFotos } from '../../../shared/application/almacenamiento-fotos';
import { limiteRetencion } from '../../../shared/domain/retencion-tombstones';
import { ConteoPurga, MantenimientoRepository } from './ports/mantenimiento.repository';

export interface ResumenPurga {
  limite: Date;
  negocios: number;
  fallidos: string[];
  borrados: ConteoPurga;
}

/**
 * Purga física de tombstones (Doc 4 Bloque 3, Doc 8 Bloque 3:
 * `PurgaSoftDeleteJob`). El horizonte sale de `limiteRetencion`, el mismo que
 * usa `GET /sync` para responder `410`: si fueran distintos, quedaría una
 * ventana donde se pierden borrados sin que nadie lo note.
 *
 * **Fotos: primero R2, después la fila.** Si fuera al revés y R2 fallara,
 * quedaría un archivo huérfano que ya nadie sabe borrar. En este orden, si lo
 * que falla es la base, la próxima corrida vuelve a borrar en R2 (idempotente)
 * y entonces sí la fila. La llamada a R2 va fuera de la transacción: Prisma
 * aborta las transacciones interactivas de más de 5 s.
 *
 * Un negocio que falla no detiene a los demás: se registra y se sigue. Es
 * idempotente —la próxima corrida retoma lo que quedó—, así que reintentar no
 * hace daño.
 */
@Injectable()
export class PurgarTombstonesUseCase {
  private readonly logger = new Logger(PurgarTombstonesUseCase.name);

  constructor(
    private readonly repositorio: MantenimientoRepository,
    private readonly almacenamiento: AlmacenamientoFotos,
  ) {}

  async execute(ahora: Date = new Date()): Promise<ResumenPurga> {
    const limite = limiteRetencion(ahora);
    const negocios = await this.repositorio.listarNegocios();
    const borrados: ConteoPurga = {
      fotos: 0,
      materiales: 0,
      trabajos: 0,
      objetos_recibidos: 0,
      pagos: 0,
    };
    const fallidos: string[] = [];

    for (const negocioId of negocios) {
      try {
        const fotos = await this.repositorio.fotosPorPurgar(negocioId, limite);
        await this.almacenamiento.eliminar(fotos.map((foto) => foto.clave));
        const conteo = await this.repositorio.purgarTombstones(
          negocioId,
          limite,
          fotos.map((foto) => foto.id),
        );
        for (const tabla of Object.keys(borrados) as (keyof ConteoPurga)[]) {
          borrados[tabla] += conteo[tabla];
        }
      } catch (error) {
        fallidos.push(negocioId);
        this.logger.error({ err: error, negocioId }, 'Falló la purga de tombstones del negocio');
      }
    }

    const resumen = { limite, negocios: negocios.length, fallidos, borrados };
    this.logger.log({ ...resumen, limite: limite.toISOString() }, 'Purga de tombstones terminada');
    return resumen;
  }
}
