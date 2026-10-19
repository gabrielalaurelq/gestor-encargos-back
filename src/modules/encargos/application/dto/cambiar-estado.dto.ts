import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EstadoEncargo } from '../../domain/estado-encargo';

// Doc 5, Bloque 2: endpoint separado del PATCH general "porque dispara efectos
// automáticos" (fecha_listo, fecha_entrega_real, advertencia de saldo).
export class CambiarEstadoDto {
  @ApiProperty({ enum: EstadoEncargo })
  @IsEnum(EstadoEncargo)
  estado!: EstadoEncargo;

  @ApiPropertyOptional({
    example: '2026-10-12',
    description:
      'Fecha del cambio, según el reloj del **dispositivo** (Doc 2, reglas 3-4: "fecha del ' +
      'dispositivo"). Es la que se graba en `fecha_listo` o `fecha_entrega_real`. Importa por ' +
      'la cola Outbox: un encargo marcado LISTO sin conexión el lunes y sincronizado el ' +
      'miércoles debe quedar fechado el lunes, no el miércoles. Si se omite, la pone el ' +
      'servidor. Se acepta hasta 1 día en el futuro y 90 en el pasado.',
  })
  @IsString()
  @IsOptional()
  fecha?: string;
}
