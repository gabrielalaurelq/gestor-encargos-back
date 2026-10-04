import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EstadoEncargo } from '../../domain/estado-encargo';

// Doc 5, Bloque 2: endpoint separado del PATCH general "porque dispara efectos
// automáticos" (fecha_listo, fecha_entrega_real, advertencia de saldo).
export class CambiarEstadoDto {
  @ApiProperty({ enum: EstadoEncargo })
  @IsEnum(EstadoEncargo)
  estado!: EstadoEncargo;
}
