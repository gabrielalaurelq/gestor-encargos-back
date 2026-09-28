import { ApiProperty } from '@nestjs/swagger';
import { Servicio } from '../domain/servicio';

export class ServicioResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Basta de jean' })
  nombre!: string;

  @ApiProperty({
    example: 20,
    description:
      'Soles con 2 decimales, como número JSON — el Doc 5 Bloque 3 ya usa números para dinero. ' +
      'Con DECIMAL(10,2) el valor entra exacto en un double; el backend nunca opera con floats.',
  })
  precio!: number;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

export function aServicioResponse(servicio: Servicio): ServicioResponse {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    precio: servicio.precio.soles,
    activo: servicio.activo,
    creado_en: servicio.creadoEn!.toISOString(),
    actualizado_en: servicio.actualizadoEn!.toISOString(),
  };
}
