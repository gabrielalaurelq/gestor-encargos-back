import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';

// PATCH parcial (Doc 5 Bloque 2). La distinción importa:
//   - campo ausente  → no se toca
//   - "telefono": null → se borra el teléfono
// `whitelist: true` en el ValidationPipe elimina las claves desconocidas pero
// conserva las declaradas que llegaron en `null`, así que el caso de uso puede
// diferenciar ambos casos con `undefined` vs `null`.
export class ActualizarClienteDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nombre?: string;

  @ApiPropertyOptional({
    example: '+51987654321',
    nullable: true,
    description: 'E.164, o null para quitar el teléfono. Omitir el campo lo deja sin cambios.',
  })
  @ValidateIf((_, valor) => valor !== null)
  @IsString()
  @IsOptional()
  telefono?: string | null;
}
