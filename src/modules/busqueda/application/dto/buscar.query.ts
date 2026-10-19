import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Doc 5, Bloque 4: `GET /buscar?q=`. Sin mínimo de caracteres (PRD 16, casos
// extremos: "una letra se permite igual"); solo se exige que haya algo que
// buscar. El recorte va antes de validar, para que "   " sea un 400 y no una
// búsqueda de espacios.
export class BuscarQuery {
  @ApiProperty({
    example: 'cajón 3',
    description: 'Parte de un nombre, teléfono, descripción de encargo o ubicación física.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q!: string;
}
