import { Injectable, NotFoundException } from '@nestjs/common';
import { NegocioPropio, NegocioRepository } from '../ports/negocio.repository';

/**
 * `GET /negocio` (Doc 5, Bloque 2): los datos del negocio autenticado.
 *
 * El 404 es casi inalcanzable —la sesión se emitió para un negocio que
 * existía—, pero puede pasar si la fila se borró entre dos peticiones con el
 * mismo access token todavía vigente.
 */
@Injectable()
export class ObtenerNegocioUseCase {
  constructor(private readonly repositorio: NegocioRepository) {}

  async execute(negocioId: string): Promise<NegocioPropio> {
    const negocio = await this.repositorio.buscarPorId(negocioId);
    if (!negocio) {
      throw new NotFoundException('El negocio no existe.');
    }
    return negocio;
  }
}
