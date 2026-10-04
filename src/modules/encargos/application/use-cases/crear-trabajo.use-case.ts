import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ObjetoNoEnEncargoError, ServicioNoDisponibleError } from '../../domain/errores';
import { EscriturasHijos } from '../../domain/repositories/encargo.repository';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { Trabajo } from '../../domain/trabajo';
import { ResultadoHijo, crearHijo } from '../crear-hijo';
import { CrearTrabajoDto } from '../dto/crear-trabajo.dto';

/**
 * `POST /encargos/{id}/trabajos` (Doc 5, Bloque 2).
 *
 * Dos vías excluyentes: desde el catálogo (`servicio_id`) o personalizado
 * (`descripcion` + `precio`). Al crear desde el catálogo se **copian** nombre y
 * precio del Servicio (Doc 2, regla 12) — nunca se referencian—, que es lo que
 * hace que editar el catálogo mañana no toque este trabajo.
 *
 * Es también el primer endpoint que mueve `precio_total` de verdad: hasta
 * ahora las sumas del agregado eran siempre 0.
 */
@Injectable()
export class CrearTrabajoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  execute(encargoId: string, dto: CrearTrabajoDto): Promise<ResultadoHijo<Trabajo>> {
    return crearHijo({
      repositorio: this.repositorio,
      encargoId,
      id: dto.id,
      leer: (hijos, id) => hijos.buscarTrabajo(id),
      escribir: async (hijos) => {
        await this.comprobarObjeto(hijos, dto.objeto_recibido_id);
        return hijos.crearTrabajo(await this.construir(hijos, dto));
      },
    });
  }

  private async construir(hijos: EscriturasHijos, dto: CrearTrabajoDto): Promise<Trabajo> {
    const desdeCatalogo = dto.servicio_id !== undefined;
    const personalizado = dto.descripcion !== undefined || dto.precio !== undefined;

    // Se valida acá y no en el DTO para devolver un código estable en vez de
    // un 400 genérico: la app necesita distinguir "mandaste las dos vías" de
    // "mandaste un campo mal tipado".
    if (desdeCatalogo && personalizado) {
      throw new UnprocessableEntityException({
        codigo: 'TRABAJO_ORIGEN_AMBIGUO',
        mensaje:
          'Un trabajo viene del catálogo (servicio_id) o es personalizado ' +
          '(descripcion + precio), no las dos cosas.',
      });
    }

    if (desdeCatalogo) {
      const servicio = await hijos.buscarServicioActivo(dto.servicio_id as string);
      if (servicio === null) {
        throw new ServicioNoDisponibleError(dto.servicio_id as string, 'no_existe');
      }
      if (servicio === 'inactivo') {
        // PRD módulo 4: un servicio desactivado "deja de ofrecerse para
        // trabajos nuevos"; los históricos no se alteran.
        throw new ServicioNoDisponibleError(dto.servicio_id as string, 'inactivo');
      }
      return Trabajo.desdeServicio(
        { id: dto.id, objetoRecibidoId: dto.objeto_recibido_id },
        servicio,
      );
    }

    if (dto.descripcion === undefined || dto.precio === undefined) {
      throw new UnprocessableEntityException({
        codigo: 'TRABAJO_ORIGEN_AMBIGUO',
        mensaje:
          'Falta indicar el origen del trabajo: servicio_id (catálogo) o ' +
          'descripcion + precio (personalizado).',
      });
    }

    return Trabajo.personalizado({
      id: dto.id,
      objetoRecibidoId: dto.objeto_recibido_id,
      descripcion: dto.descripcion,
      precio: dto.precio,
    });
  }

  /** El objeto vinculado, si se indica, tiene que ser de este mismo encargo. */
  private async comprobarObjeto(hijos: EscriturasHijos, objetoId?: string | null): Promise<void> {
    if (objetoId !== undefined && objetoId !== null && !(await hijos.buscarObjeto(objetoId))) {
      throw new ObjetoNoEnEncargoError(objetoId);
    }
  }
}
