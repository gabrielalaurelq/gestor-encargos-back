import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

// Doc 5, Bloque 2: `texto` y la `fecha` del dispositivo. Sin PATCH ni DELETE:
// una nota es inmutable (Doc 2, invariante 16).
export class CrearNotaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'UUID generado en el dispositivo (Doc 3).' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'El cliente pidió que lo llamemos antes de entregar.' })
  @IsString()
  texto!: string;

  @ApiPropertyOptional({
    example: '2026-10-12',
    description:
      'Fecha en que ocurrió, según el reloj del **dispositivo** (Doc 2, invariante 4 / PRD ' +
      'módulo 5). Importa por la cola Outbox: un registro hecho sin conexión el lunes y ' +
      'sincronizado el miércoles debe quedar fechado el lunes, porque la Caja diaria agrupa ' +
      'por fecha. Si se omite, la pone el servidor. Se acepta hasta 1 día en el futuro y 90 ' +
      'en el pasado.',
  })
  @IsString()
  @IsOptional()
  fecha?: string;
}
