import { ApiProperty } from '@nestjs/swagger';
import { NegocioPropio } from '../application/ports/negocio.repository';

export class NegocioResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, example: 'Sastrería La Esperanza' })
  nombre_negocio!: string | null;

  @ApiProperty({
    enum: ['FREE', 'PREMIUM'],
    description:
      'La app lo necesita para el feature-gating de las funciones premium (Doc 10). Lo mueve ' +
      'la pasarela de pago, nunca este endpoint.',
  })
  plan!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Cuándo caduca el plan premium. Un job diario revierte a FREE al pasarse.',
  })
  plan_vence_en!: string | null;

  @ApiProperty({ example: 2, description: 'Umbral del aviso "Cliente no recoge" (PRD 13).' })
  dias_aviso_no_recoge!: number;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

// `google_uid` y `siguiente_bloque_numeros` no se exponen a propósito: el
// primero es el identificador del proveedor de identidad y el segundo es el
// contador interno de numeración, que ya tiene su propio endpoint.
export function aNegocioResponse(negocio: NegocioPropio): NegocioResponse {
  return {
    id: negocio.id,
    nombre_negocio: negocio.nombreNegocio,
    plan: negocio.plan,
    plan_vence_en: negocio.planVenceEn?.toISOString() ?? null,
    dias_aviso_no_recoge: negocio.diasAvisoNoRecoge,
    creado_en: negocio.creadoEn.toISOString(),
    actualizado_en: negocio.actualizadoEn.toISOString(),
  };
}
