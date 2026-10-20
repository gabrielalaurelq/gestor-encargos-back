import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// Doc 5 Bloque 2 / Doc 8 Bloque 3: solo metadatos, nunca el binario — la app
// lo sube directo a R2 con la `upload_url` de la respuesta.
export class CrearFotoDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'UUID generado en el dispositivo (Doc 3). Reenviar el mismo id devuelve una `upload_url` ' +
      'nueva: es la forma de reintentar una subida que falló o cuya URL venció.',
  })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Objeto al que pertenece. Si se omite, es una foto general del encargo.',
  })
  @IsUUID()
  @IsOptional()
  objeto_recibido_id?: string | null;
}
