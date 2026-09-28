import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacionQuery } from '../../../../shared/application/dto/paginacion.query';

export class ListarClientesQuery extends PaginacionQuery {
  @ApiPropertyOptional({
    description:
      'Búsqueda parcial por nombre o teléfono (Doc 5 Bloque 2, Caso 8). ' +
      'Con menos de 3 caracteres el índice de trigramas no aplica, pero la búsqueda funciona igual.',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;
}
