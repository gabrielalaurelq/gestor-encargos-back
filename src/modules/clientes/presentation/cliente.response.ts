import { ApiProperty } from '@nestjs/swagger';
import { Cliente } from '../domain/cliente';

// Doc 5: snake_case en las respuestas JSON. Este mapper es la única frontera
// entre el dominio (camelCase, Value Objects) y el contrato público.
export class ClienteResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ nullable: true, example: '+51987654321' })
  telefono!: string | null;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Marca que usa el delta sync del Doc 5 Bloque 1 (LWW).',
  })
  actualizado_en!: string;
}

export function aClienteResponse(cliente: Cliente): ClienteResponse {
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono?.valor ?? null,
    // Solo un Cliente reconstituido desde la base llega hasta acá, así que las
    // marcas siempre existen; el `!` lo afirma sin arrastrar opcionales al DTO.
    creado_en: cliente.creadoEn!.toISOString(),
    actualizado_en: cliente.actualizadoEn!.toISOString(),
  };
}
