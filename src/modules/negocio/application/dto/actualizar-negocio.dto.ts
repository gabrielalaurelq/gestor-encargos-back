import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength, ValidateIf } from 'class-validator';

// Doc 5, Bloque 2: "editar `nombre_negocio`", más el umbral de "Cliente no
// recoge" que el PRD 13 pone en Ajustes. Ni el plan (lo mueve la pasarela de
// pago, Doc 10) ni el contador de numeración se tocan desde acá.
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

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 30,
    example: 2,
    description:
      'Días desde que el encargo quedó LISTO para avisar "Cliente no recoge" (PRD 13). Las ' +
      'próximas evaluaciones usan el valor nuevo; los avisos ya enviados no se recalculan.',
  })
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  dias_aviso_no_recoge?: number;
}
