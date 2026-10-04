import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class SyncQuery {
  @ApiPropertyOptional({
    example: '2026-10-04T14:32:00.000Z',
    description:
      'Marca que el dispositivo guardó de la sincronización anterior (el `servidor_timestamp` ' +
      'de esa respuesta, nunca el máximo `actualizado_en` que vio). Si se omite, se devuelve el ' +
      'estado completo del negocio: es la primera sincronización de un dispositivo nuevo.',
  })
  @IsISO8601()
  @IsOptional()
  since?: string;
}
