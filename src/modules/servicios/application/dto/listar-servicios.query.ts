import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginacionQuery } from '../../../../shared/application/dto/paginacion.query';

export class ListarServiciosQuery extends PaginacionQuery {
  @ApiPropertyOptional({
    default: false,
    description:
      'Por defecto la lista trae solo los activos (Doc 5, Bloque 2); con true incluye también ' +
      'los desactivados, para la pantalla de mantenimiento del catálogo.',
  })
  // Un query param siempre llega como string. `@Type(() => Boolean)` no sirve:
  // Boolean('false') es true. Se convierte a mano y se deja pasar cualquier
  // otro valor tal cual para que @IsBoolean lo rechace con un 400 claro.
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  @IsOptional()
  incluir_inactivos: boolean = false;
}
