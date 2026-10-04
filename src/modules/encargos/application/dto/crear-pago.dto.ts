import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { TipoPago } from '../../domain/pago';

// Doc 5, Bloque 2: `monto`, `origen_id`, `tipo`. La `fecha` la asigna el
// servidor y nunca viene del request (Doc 2, invariante 4).
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
}
