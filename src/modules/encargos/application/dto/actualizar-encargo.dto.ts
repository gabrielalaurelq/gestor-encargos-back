import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';

// Doc 5, Bloque 2: editar `descripcion`, `fecha_entrega_acordada` (reprogramar),
// `descuento`, `ubicacion_fisica` y `notas_generales`. El estado tiene su propio
// endpoint; `fecha_listo` y `fecha_entrega_real` nunca son editables (Doc 2,
// invariante 8) y por eso ni figuran.
export class ActualizarEncargoDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({
    example: '2026-10-20',
    description:
      'Reprogramar. Mueve solo la fecha acordada: la prometida queda intacta como testigo del ' +
      'primer compromiso (Doc 2, invariantes 6-7).',
  })
  @IsString()
  @IsOptional()
  fecha_entrega_acordada?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  descuento?: number;

  @ApiPropertyOptional({ nullable: true })
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
