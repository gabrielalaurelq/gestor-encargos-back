import { Injectable } from '@nestjs/common';
import {
  AlmacenamientoFotos,
  UrlFirmada,
} from '../../../../shared/application/almacenamiento-fotos';
import { ObjetoNoEnEncargoError } from '../../domain/errores';
import { Foto } from '../../domain/foto';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { crearHijo } from '../crear-hijo';
import { CrearFotoDto } from '../dto/crear-foto.dto';

export interface FotoCreada {
  foto: Foto;
  creado: boolean;
  subida: UrlFirmada;
  descarga: UrlFirmada;
}

/**
 * `POST /encargos/{id}/fotos` (Doc 5 Bloque 2, Doc 8 Bloque 3): registra los
 * metadatos y devuelve una URL firmada para que la app suba el archivo
 * **directo a R2**, sin pasar por el backend.
 *
 * **Reintento de subida = reenviar el mismo `POST`** (decisión del usuario,
 * frente a una columna de "subida confirmada"): si el `PUT` a R2 falló o la URL
 * venció, la cola Outbox reenvía el alta con el mismo id y recibe `200` con una
 * URL nueva. Mientras el archivo no exista, los otros dispositivos reciben una
 * URL de descarga que da 404, y lo muestran como "foto no disponible todavía".
 */
@Injectable()
export class CrearFotoUseCase {
  constructor(
    private readonly repositorio: EncargoRepository,
    private readonly almacenamiento: AlmacenamientoFotos,
  ) {}

  async execute(encargoId: string, dto: CrearFotoDto): Promise<FotoCreada> {
    const { hijo, creado } = await crearHijo({
      repositorio: this.repositorio,
      encargoId,
      id: dto.id,
      leer: (hijos, id) => hijos.buscarFoto(id),
      escribir: async (hijos) => {
        const objetoId = dto.objeto_recibido_id ?? null;
        // Sin esto, un objeto ajeno o borrado daría un 500 por FK, o colgaría
        // la foto de un tombstone.
        if (objetoId !== null && !(await hijos.buscarObjeto(objetoId))) {
          throw new ObjetoNoEnEncargoError(objetoId);
        }
        return hijos.crearFoto(Foto.crear({ id: dto.id, objetoRecibidoId: objetoId }));
      },
    });

    // Se firma fuera de la transacción: es local, pero no hace falta retenerla.
    // La de descarga va también para que la foto tenga la misma forma en todas
    // las respuestas; dará 404 hasta que termine la subida.
    const [subida, descarga] = await Promise.all([
      this.almacenamiento.urlSubida(hijo.clave!),
      this.almacenamiento.urlDescarga(hijo.clave!),
    ]);
    return { foto: hijo, creado, subida, descarga };
  }
}
