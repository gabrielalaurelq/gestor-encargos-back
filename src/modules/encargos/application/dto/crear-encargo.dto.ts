import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';

// Doc 5, Bloque 2: mínimo `cliente_id`, `descripcion`, `fecha_entrega_acordada`
// (Caso 7). Acá solo se valida tipo y formato; nombre vacío, fecha ausente o
// mal formada y descuento inválido son reglas de negocio → 422 del catálogo.
export class CrearEncargoDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'UUID generado en el dispositivo (Doc 3).' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cliente_id!: string;

  @ApiPropertyOptional({
    description:
      'Número tomado del bloque que el dispositivo reservó con ' +
      'POST /encargos/reservar-bloque-numeros (Doc 3, ADR-008). Si se omite queda en null ' +
      '("Pendiente"): es el caso límite de un dispositivo que agotó su bloque sin conexión.',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  numero?: number;

  @ApiProperty({ example: 'Arreglo de pantalón azul' })
  @IsString()
  descripcion!: string;

  @ApiProperty({
    example: '2026-10-15',
    description: 'AAAA-MM-DD. Obligatoria, aunque sea estimada.',
  })
  @IsString()
  @IsOptional()
  fecha_entrega_acordada?: string;

  @ApiPropertyOptional({ example: 0, description: 'Sin Trabajos todavía, solo se admite 0.' })
  @IsNumber()
  @IsOptional()
  descuento?: number;

  @ApiPropertyOptional({ nullable: true, example: 'Cajón azul, estante 3' })
  @ValidateIf((_, valor) => valor !== null)
  @IsString()
  @IsOptional()
  ubicacion_fisica?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, valor) => valor !== null)
  @IsString()
  @IsOptional()
  notas_generales?: string | null;
}
