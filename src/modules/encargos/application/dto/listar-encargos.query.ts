import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginacionQuery } from '../../../../shared/application/dto/paginacion.query';
import { EstadoEncargo } from '../../domain/estado-encargo';

// Doc 5, Bloque 2: alimenta Dashboard, Balance de Carga y Calendario.
export class ListarEncargosQuery extends PaginacionQuery {
  @ApiPropertyOptional({ enum: EstadoEncargo })
  @IsEnum(EstadoEncargo)
  @IsOptional()
  estado?: EstadoEncargo;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Filtra por fecha_entrega_acordada.' })
  @IsString()
  @IsOptional()
  fecha_desde?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsString()
  @IsOptional()
  fecha_hasta?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  cliente_id?: string;
}
