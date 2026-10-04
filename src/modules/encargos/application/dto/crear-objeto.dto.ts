import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CrearObjetoDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'UUID generado en el dispositivo (Doc 3).' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'Pantalón de vestir azul' })
  @IsString()
  descripcion!: string;
}

export class ActualizarObjetoDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  descripcion?: string;
}
