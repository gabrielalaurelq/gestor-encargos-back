import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

// Doc 5, Bloque 2: "editar precio o `activo`". El `nombre` no entra — ver el
// comentario de `Servicio.aplicar()`.
export class ActualizarServicioDto {
  @ApiPropertyOptional({
    example: 22,
    description:
      'Nuevo precio. No es retroactivo: los Trabajos ya creados conservan el precio que ' +
      'copiaron (Doc 2, invariante 12).',
  })
  @IsNumber()
  @IsOptional()
  precio?: number;

  @ApiPropertyOptional({
    description:
      'false desactiva el servicio: deja de ofrecerse para trabajos nuevos, pero el historial ' +
      'no se altera (Doc 2, invariante 14). No existe DELETE.',
  })
  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
