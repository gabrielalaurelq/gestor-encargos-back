import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

// Doc 5, Bloque 2 / PRD módulo 15: nombre obligatorio; cantidad y costo
// opcionales. Sin PATCH: un material se corrige borrándolo y creando otro.
export class CrearMaterialDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'UUID generado en el dispositivo (Doc 3).' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'Cierre metálico' })
  @IsString()
  nombre!: string;

  @ApiPropertyOptional({
    example: '2 metros',
    nullable: true,
    description: 'Texto libre ("1 rollo", "media docena"). Vacío equivale a no informarla.',
  })
  @IsString()
  @IsOptional()
  cantidad?: string | null;

  @ApiPropertyOptional({
    example: 4.5,
    nullable: true,
    description: 'Solo informativo: no entra en `precio_total` ni en ningún cálculo (PRD 15).',
  })
  @IsNumber()
  @IsOptional()
  costo?: number | null;
}
