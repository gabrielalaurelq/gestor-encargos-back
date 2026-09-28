import { ApiProperty } from '@nestjs/swagger';

// Doc 5, Bloque 4: forma exacta de toda respuesta paginada.
//   { "datos": [...], "pagina": 1, "por_pagina": 20, "total": 47 }
export interface PaginaResultado<T> {
  datos: T[];
  total: number;
}

export interface RespuestaPaginada<T> {
  datos: T[];
  pagina: number;
  por_pagina: number;
  total: number;
}

export function respuestaPaginada<T>(
  pagina: PaginaResultado<T>,
  numeroPagina: number,
  porPagina: number,
): RespuestaPaginada<T> {
  return {
    datos: pagina.datos,
    pagina: numeroPagina,
    por_pagina: porPagina,
    total: pagina.total,
  };
}

/**
 * Clase solo para que Swagger documente la envoltura; el código usa
 * `respuestaPaginada()`. `datos` se declara en cada controller con
 * `@ApiOkResponse({ schema: ... })` o con un DTO específico.
 */
export class RespuestaPaginadaDto {
  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  por_pagina!: number;

  @ApiProperty({ example: 47 })
  total!: number;
}
