import { Injectable, NotFoundException } from '@nestjs/common';
import { DetalleEncargo, EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `GET /encargos/{id}` (Doc 5, Bloque 2): detalle completo con los hijos
 * anidados. Fotos llega en Sprint 7 (Doc 11), junto con Materiales.
 *
 * Un id de otro negocio también termina en 404, sin comprobarlo: el filtro de
 * `PrismaNegocio` y RLS hacen que la fila no exista para esta sesión. Es lo que
 * pide el Doc 5 Bloque 3 — nunca 403, porque "prohibido" confirmaría que el
 * recurso existe en otro tenant.
 */
@Injectable()
export class ObtenerEncargoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(id: string): Promise<DetalleEncargo> {
    const detalle = await this.repositorio.buscarDetalle(id);
    if (!detalle) {
      throw new NotFoundException('El encargo no existe.');
    }
    return detalle;
  }
}
