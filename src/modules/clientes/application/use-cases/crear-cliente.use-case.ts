import { ConflictException, Injectable } from '@nestjs/common';
import { Cliente } from '../../domain/cliente';
import {
  ClienteDuplicadoError,
  ClienteRepository,
} from '../../domain/repositories/cliente.repository';
import { CrearClienteDto } from '../dto/crear-cliente.dto';

export interface ResultadoCrearCliente {
  cliente: Cliente;
  /** `false` cuando el id ya existía: la respuesta es 200, no 201. */
  creado: boolean;
}

/**
 * `POST /clientes` (Doc 5, Bloque 2).
 *
 * **Idempotencia — decisión de este módulo, no estaba en los Docs.** El Doc 3
 * fija UUIDs generados en el dispositivo y el Doc 5 Bloque 1 dice que la cola
 * Outbox reintenta cada escritura "como una llamada REST normal". Si se pierde
 * la *respuesta* (no el request), ese reintento crearía un cliente duplicado.
 * Por eso: si el `id` que manda el dispositivo ya existe en este negocio, se
 * devuelve el existente sin tocarlo (200) en vez de duplicar (201).
 *
 * El mismo patrón aplicará a POST /encargos, /trabajos, /pagos y /notas.
 */
@Injectable()
export class CrearClienteUseCase {
  constructor(private readonly repositorio: ClienteRepository) {}

  async execute(dto: CrearClienteDto): Promise<ResultadoCrearCliente> {
    if (dto.id) {
      const existente = await this.repositorio.buscarPorId(dto.id);
      if (existente) {
        return { cliente: existente, creado: false };
      }
    }

    // Se valida antes de tocar la base: si el nombre o el teléfono no cumplen,
    // el 422 sale sin haber abierto transacción.
    const cliente = Cliente.crear(dto);

    try {
      return { cliente: await this.repositorio.crear(cliente), creado: true };
    } catch (error) {
      // Dos reintentos del Outbox en paralelo con el mismo id: ambos pasan la
      // comprobación de arriba y uno choca contra la llave primaria. El que
      // pierde relee y devuelve lo que escribió el otro.
      if (error instanceof ClienteDuplicadoError) {
        const existente = await this.repositorio.buscarPorId(cliente.id);
        if (existente) {
          return { cliente: existente, creado: false };
        }

        // Chocó con la llave primaria pero la fila no es visible para esta
        // sesión: el id pertenece a otro negocio. La llave es global, los
        // negocios no. Se responde 409 con un mensaje que no dice de quién es
        // —decirlo confirmaría la existencia del recurso en otro tenant, justo
        // lo que el Doc 5 Bloque 3 evita al preferir 404 sobre 403—. No es
        // enumerable: habría que adivinar un UUID v4 entero.
        throw new ConflictException('El id enviado ya está en uso.');
      }
      throw error;
    }
  }
}
