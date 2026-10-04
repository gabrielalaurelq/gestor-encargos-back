import { Injectable, NotFoundException } from '@nestjs/common';
import { CambiosEncargo, Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ActualizarEncargoDto } from '../dto/actualizar-encargo.dto';

/** `PATCH /encargos/{id}` (Doc 5, Bloque 2). */
@Injectable()
export class ActualizarEncargoUseCase {
  constructor(private readonly repositorio: EncargoRepository) {}

  async execute(id: string, dto: ActualizarEncargoDto): Promise<Encargo> {
    const encargo = await this.repositorio.buscarPorId(id);
    if (!encargo) {
      throw new NotFoundException('El encargo no existe.');
    }

    // Las sumas de los hijos solo se consultan si el descuento entra en juego:
    // es el único cambio de este endpoint que obliga a recalcular (invariante 1).
    const sumas = dto.descuento !== undefined ? await this.repositorio.sumas(id) : undefined;

    if (!encargo.aplicar(ActualizarEncargoUseCase.aDominio(dto), sumas)) {
      return encargo;
    }

    return this.repositorio.actualizar(encargo);
  }

  /**
   * snake_case del contrato → camelCase del dominio, conservando la diferencia
   * entre "clave ausente" (no se toca) y `null` (se borra). Copiar solo las
   * claves presentes es lo que preserva esa distinción.
   */
  private static aDominio(dto: ActualizarEncargoDto): CambiosEncargo {
    const cambios: CambiosEncargo = {};

    if ('descripcion' in dto) cambios.descripcion = dto.descripcion;
    if ('fecha_entrega_acordada' in dto) cambios.fechaEntregaAcordada = dto.fecha_entrega_acordada;
    if ('descuento' in dto) cambios.descuento = dto.descuento;
    if ('ubicacion_fisica' in dto) cambios.ubicacionFisica = dto.ubicacion_fisica;
    if ('notas_generales' in dto) cambios.notasGenerales = dto.notas_generales;

    return cambios;
  }
}
