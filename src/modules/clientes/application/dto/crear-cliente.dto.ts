import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

// Doc 5 usa snake_case en los cuerpos JSON, así que los DTOs también.
//
// Solo se validan tipo y formato acá (400). Las reglas de negocio —nombre no
// vacío, teléfono E.164— viven en el dominio y salen como 422 con el código
// del catálogo del Doc 5 Bloque 3.
export class CrearClienteDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'UUID generado en el dispositivo (Doc 3: identificadores del cliente, no del servidor). ' +
      'Si se omite, lo genera el servidor. Si ya existe un cliente con ese id en este negocio, ' +
      'la respuesta es 200 con el cliente existente en lugar de 201 — así el reintento de la ' +
      'cola Outbox no duplica.',
  })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty()
  @IsString()
  nombre!: string;

  @ApiPropertyOptional({
    example: '+51987654321',
    nullable: true,
    description: 'Formato E.164 obligatorio. Opcional (Doc 2, invariante 18).',
  })
  // `null` es un valor válido (sin teléfono); @IsString() lo rechazaría.
  @ValidateIf((_, valor) => valor !== null)
  @IsString()
  @IsOptional()
  telefono?: string | null;
}
