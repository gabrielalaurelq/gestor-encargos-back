import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AlmacenamientoFotos,
  UrlFirmada,
} from '../../../../shared/application/almacenamiento-fotos';
import { DetalleEncargo, EncargoRepository } from '../../domain/repositories/encargo.repository';

export interface DetalleConDescargas extends DetalleEncargo {
  /** URL firmada de descarga de cada foto, por id. */
  descargas: Map<string, UrlFirmada>;
}

/**
 * `GET /encargos/{id}` (Doc 5, Bloque 2): detalle completo con los hijos
 * anidados (materiales dentro de cada trabajo) y las fotos con una URL de
 * descarga **recién firmada**. Es también la vía para renovar una URL vencida:
 * no hace falta un endpoint propio para eso.
 *
 * Un id de otro negocio también termina en 404, sin comprobarlo: el filtro de
 * `PrismaNegocio` y RLS hacen que la fila no exista para esta sesión. Es lo que
 * pide el Doc 5 Bloque 3 — nunca 403, porque "prohibido" confirmaría que el
 * recurso existe en otro tenant.
 */
@Injectable()
export class ObtenerEncargoUseCase {
  constructor(
    private readonly repositorio: EncargoRepository,
    private readonly almacenamiento: AlmacenamientoFotos,
  ) {}

  async execute(id: string): Promise<DetalleConDescargas> {
    const detalle = await this.repositorio.buscarDetalle(id);
    if (!detalle) {
      throw new NotFoundException('El encargo no existe.');
    }

    const firmadas = await Promise.all(
      detalle.fotos.map(
        async (foto) => [foto.id, await this.almacenamiento.urlDescarga(foto.clave!)] as const,
      ),
    );
    return { ...detalle, descargas: new Map(firmadas) };
  }
}
