import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

// Doc 5, Bloque 2: "editar `nombre_negocio`". Es el único campo editable: ni
// el plan (lo mueve la pasarela de pago, Doc 10) ni el contador de numeración
// se tocan desde acá.
export class ActualizarNegocioDto {
  @ApiPropertyOptional({
    nullable: true,
    example: 'Sastrería La Esperanza',
    description:
      'Nombre del negocio. Nace en null (Doc 5, Bloque 1: el usuario inicia sesión y su ' +
      'negocio ya existe, sin nombre hasta que decida ponérselo). Enviar null, o una cadena ' +
      'vacía, lo deja de nuevo sin nombre.',
  })
  @ValidateIf((_, valor) => valor !== null)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  nombre_negocio?: string | null;
}
