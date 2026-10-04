import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

// Doc 5, Bloque 2: solo `texto`; la `fecha` la asigna el servidor. Sin PATCH
// ni DELETE: una nota es inmutable (Doc 2, invariante 16).
export class CrearNotaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'UUID generado en el dispositivo (Doc 3).' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'El cliente pidió que lo llamemos antes de entregar.' })
  @IsString()
  texto!: string;
}
