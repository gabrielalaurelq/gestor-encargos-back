import { Injectable } from '@nestjs/common';
import { BloqueNumeros, NumeracionRepository } from '../../domain/repositories/encargo.repository';

/**
 * Tamaño del bloque que reserva cada dispositivo (Doc 3, ADR-008). El Doc 3
 * usa "del 101 al 200" como ejemplo pero nunca lo fija; se elige 100.
 *
 * Con ~100 encargos activos por negocio (Doc 0 §12.3), un bloque dura semanas
 * o meses sin conexión, así que el caso límite del Doc 3 —agotarlo offline y
 * quedarse sin número— es casi teórico. El coste de equivocarse es cosmético:
 * un hueco en la numeración si un dispositivo se pierde o se reinstala.
 */
export const TAMANO_BLOQUE_NUMEROS = 100;

/**
 * `POST /encargos/reservar-bloque-numeros`.
 *
 * **Este endpoint falta en el Doc 5.** El Doc 3 lo pide explícitamente al
 * cerrar el ADR-008 ("Doc 5 necesita un endpoint POST
 * /encargos/reservar-bloque-numeros") y el Doc 4 ya reserva la columna
 * `negocios.siguiente_bloque_numeros`, pero el Doc 5 Bloque 2 nunca lo
 * incorporó. Sin él, `encargos.numero` sería siempre null.
 */
@Injectable()
export class ReservarBloqueNumerosUseCase {
  constructor(private readonly numeracion: NumeracionRepository) {}

  execute(negocioId: string): Promise<BloqueNumeros> {
    return this.numeracion.reservarBloque(negocioId, TAMANO_BLOQUE_NUMEROS);
  }
}
