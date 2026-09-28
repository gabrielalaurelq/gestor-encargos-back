import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

// Solo tipo y formato acá (400). Nombre vacío y precio negativo son reglas de
// negocio: salen como 422 desde el dominio, con el código del Doc 5 Bloque 3.
export class CrearServicioDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'UUID generado en el dispositivo (Doc 3). Si se omite, lo genera el servidor. Si ya ' +
      'existe un servicio con ese id en este negocio, la respuesta es 200 con el existente.',
  })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'Basta de jean' })
  @IsString()
  nombre!: string;

  @ApiProperty({
    example: 20,
    description:
      'Soles, hasta 2 decimales (DECIMAL(10,2) en el Doc 4). Se rechaza un tercer decimal en ' +
      'vez de redondearlo. El 0 es válido (PRD módulo 4: sin precio mínimo forzado).',
  })
  // maxDecimalPlaces no se fija acá: el VO Monto lo valida y así el rechazo
  // sale como 422 del catálogo y no como un 400 genérico.
  @IsNumber()
  precio!: number;
}
