import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Doc 5, Bloque 4: paginación por offset (`?pagina=1&por_pagina=20`), no por
// cursor — el volumen por negocio es pequeño (Doc 0 §12.3) y offset alcanza.
// Vive en shared/ porque los tres listados del Doc 5 (`/clientes`,
// `/servicios`, `/encargos`) usan exactamente los mismos parámetros.
export const PAGINA_POR_DEFECTO = 1;
export const POR_PAGINA_POR_DEFECTO = 20;

// Techo defensivo: sin él, `?por_pagina=100000` traería el negocio entero en
// una respuesta. El Doc 5 no fija un máximo; 100 es holgado frente a los
// ~200 clientes / ~100 encargos activos que el Doc 0 §12.3 estima por negocio.
export const POR_PAGINA_MAXIMO = 100;

export class PaginacionQuery {
  @ApiPropertyOptional({ minimum: 1, default: PAGINA_POR_DEFECTO })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pagina: number = PAGINA_POR_DEFECTO;

  @ApiPropertyOptional({ minimum: 1, maximum: POR_PAGINA_MAXIMO, default: POR_PAGINA_POR_DEFECTO })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POR_PAGINA_MAXIMO)
  @IsOptional()
  por_pagina: number = POR_PAGINA_POR_DEFECTO;
}
