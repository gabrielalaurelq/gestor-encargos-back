import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { TipoPago } from '../../domain/pago';

// Doc 5, Bloque 2: `monto`, `origen_id`, `tipo`. La `fecha` la pone el reloj
// del dispositivo (Doc 2, invariante 4: "la fecha del dispositivo al momento
// del registro"); el usuario nunca la teclea, así que sigue siendo automática
// y no editable.
export class CrearPagoDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'UUID generado en el dispositivo (Doc 3).' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 100, description: 'Debe ser mayor que cero (Doc 4, CHECK monto > 0).' })
  @IsNumber()
  monto!: number;

  @ApiProperty({
    example: 3,
    description: 'Id del catálogo `origenes_pago`: Efectivo, Transferencia, Yape, Plin.',
  })
  @IsInt()
  origen_id!: number;

  @ApiProperty({ enum: TipoPago })
  @IsEnum(TipoPago)
  tipo!: TipoPago;

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
