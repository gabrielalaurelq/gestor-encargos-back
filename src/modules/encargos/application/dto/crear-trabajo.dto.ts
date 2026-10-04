import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

/**
 * Doc 5, Bloque 2: `{servicio_id}` (desde catálogo, precio copiado y bloqueado)
 * **o** `{descripcion, precio}` (personalizado). Son dos formas excluyentes; la
 * comprobación de cuál llegó se hace en el caso de uso para poder devolver un
 * código del catálogo en vez de un 400 genérico.
 */
export class CrearTrabajoDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'UUID generado en el dispositivo (Doc 3).' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Servicio del catálogo. Su nombre y precio se copian y el precio queda bloqueado ' +
      '(Doc 2, invariantes 12-13). Excluyente con descripcion/precio.',
  })
  @IsUUID()
  @IsOptional()
  servicio_id?: string;

  @ApiPropertyOptional({ description: 'Solo para trabajos personalizados.' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({ example: 25, description: 'Solo para trabajos personalizados.' })
  @IsNumber()
  @IsOptional()
  precio?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Objeto recibido al que se vincula. Opcional (Doc 2, invariante 19 / Caso 6).',
  })
  @ValidateIf((_, valor) => valor !== null)
  @IsUUID()
  @IsOptional()
  objeto_recibido_id?: string | null;
}

export class ActualizarTrabajoDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Rechazado con 422 si el trabajo vino del catálogo (Doc 2, invariante 13).',
  })
  @IsNumber()
  @IsOptional()
  precio?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((_, valor) => valor !== null)
  @IsUUID()
  @IsOptional()
  objeto_recibido_id?: string | null;
}
