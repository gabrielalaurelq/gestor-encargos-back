import { Injectable, NotFoundException } from '@nestjs/common';
import { Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';

/**
 * `DELETE /encargos/{id}/pagos/{pagoId}` (Doc 5, Bloque 2) — soft delete que
 * recalcula `saldo_pendiente`.
 *
 * Es soft y no físico por el invariante 15: cancelar un encargo o desactivar un
 * servicio nunca borra pagos ya registrados, porque el negocio necesita el
 * historial para saber si debe devolver dinero. El tombstone además propaga el
 * borrado por delta sync, y la Caja diaria (PRD módulo 12) ya sabe excluirlo.
 */
@Injectable()
export class EliminarPagoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(encargoId: string, pagoId: string): Promise<Encargo> {
    const mutacion = await this.repositorio.mutarAgregado(encargoId, async (hijos) => {
      if (!(await hijos.eliminarPago(pagoId))) {
        throw new NotFoundException('El pago no existe en este encargo.');
      }
    });

    if (!mutacion) {
      throw new NotFoundException('El encargo no existe.');
    }
    return mutacion.encargo;
  }
}
