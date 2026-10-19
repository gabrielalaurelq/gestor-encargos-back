import { ApiProperty } from '@nestjs/swagger';
import { isoDesdeFecha } from '../../../shared/domain/fecha';
import { Encargo } from '../domain/encargo';
import { Material } from '../domain/material';
import { Nota } from '../domain/nota';
import { ObjetoRecibido } from '../domain/objeto-recibido';
import { Pago, TipoPago } from '../domain/pago';
import { Trabajo } from '../domain/trabajo';

export class ObjetoResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  descripcion!: string;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

export class TrabajoResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Servicio del que se copió. Solo rastro de procedencia: el precio ya está fijo.',
  })
  servicio_id!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  objeto_recibido_id!: string | null;

  @ApiProperty()
  descripcion!: string;

  @ApiProperty({ example: 20 })
  precio!: number;

  @ApiProperty({
    description:
      'true si vino del catálogo: su precio no se puede editar desde el trabajo (Doc 2, ' +
      'invariante 13). Se expone para que la UI deshabilite el campo en vez de dejar que el ' +
      'usuario intente y reciba un 422.',
  })
  precio_bloqueado!: boolean;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

export class MaterialResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  trabajo_id!: string;

  @ApiProperty({ example: 'Cierre metálico' })
  nombre!: string;

  @ApiProperty({ example: '2 metros', nullable: true })
  cantidad!: string | null;

  @ApiProperty({ example: 4.5, nullable: true, description: 'Solo informativo (PRD 15).' })
  costo!: number | null;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

/** Trabajo tal como aparece en el detalle del encargo: con sus materiales. */
export class TrabajoDetalleResponse extends TrabajoResponse {
  @ApiProperty({ isArray: true, type: MaterialResponse })
  materiales!: MaterialResponse[];
}

export class PagoResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 100 })
  monto!: number;

  @ApiProperty({ example: 3, description: 'Id del catálogo `origenes_pago`.' })
  origen_id!: number;

  @ApiProperty({ enum: TipoPago })
  tipo!: TipoPago;

  @ApiProperty({ example: '2026-10-04', description: 'La asigna el servidor; nunca editable.' })
  fecha!: string;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

export class NotaResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  texto!: string;

  @ApiProperty({ example: '2026-10-04' })
  fecha!: string;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

/**
 * Campos calculados de la raíz que devuelve toda escritura de un hijo.
 *
 * Doc 5, Bloque 3: "las escrituras que afectan campos calculados devuelven
 * `200` con el recurso completo actualizado" — acá se devuelve el hijo más
 * estos tres campos, que es lo que el documento pide ("el Trabajo creado y el
 * `precio_total` ya recalculado"), sin inflar la respuesta con el encargo
 * entero: la app ya tiene el resto en su base local.
 */
export class DerivadosEncargoResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 20 })
  precio_total!: number;

  @ApiProperty({ example: 0, description: 'Puede haberse ajustado solo (Doc 2, invariante 2).' })
  descuento!: number;

  @ApiProperty({ example: 20, description: 'Puede ser negativo: saldo a favor del cliente.' })
  saldo_pendiente!: number;
}

export function aDerivadosResponse(encargo: Encargo): DerivadosEncargoResponse {
  return {
    id: encargo.id,
    precio_total: encargo.precioTotal.soles,
    descuento: encargo.descuento.soles,
    saldo_pendiente: encargo.saldoPendiente.soles,
  };
}

export function aObjetoResponse(objeto: ObjetoRecibido): ObjetoResponse {
  return {
    id: objeto.id,
    descripcion: objeto.descripcion,
    creado_en: objeto.creadoEn!.toISOString(),
    actualizado_en: objeto.actualizadoEn!.toISOString(),
  };
}

export function aTrabajoResponse(trabajo: Trabajo): TrabajoResponse {
  return {
    id: trabajo.id,
    servicio_id: trabajo.servicioId,
    objeto_recibido_id: trabajo.objetoRecibidoId,
    descripcion: trabajo.descripcion,
    precio: trabajo.precio.soles,
    precio_bloqueado: trabajo.precioBloqueado,
    creado_en: trabajo.creadoEn!.toISOString(),
    actualizado_en: trabajo.actualizadoEn!.toISOString(),
  };
}

export function aMaterialResponse(material: Material): MaterialResponse {
  return {
    id: material.id,
    trabajo_id: material.trabajoId,
    nombre: material.nombre,
    cantidad: material.cantidad,
    costo: material.costo?.soles ?? null,
    creado_en: material.creadoEn!.toISOString(),
    actualizado_en: material.actualizadoEn!.toISOString(),
  };
}

export function aPagoResponse(pago: Pago): PagoResponse {
  return {
    id: pago.id,
    monto: pago.monto.soles,
    origen_id: pago.origenId,
    tipo: pago.tipo,
    fecha: isoDesdeFecha(pago.fecha),
    creado_en: pago.creadoEn!.toISOString(),
    actualizado_en: pago.actualizadoEn!.toISOString(),
  };
}

export function aNotaResponse(nota: Nota): NotaResponse {
  return {
    id: nota.id,
    texto: nota.texto,
    fecha: isoDesdeFecha(nota.fecha),
    creado_en: nota.creadoEn!.toISOString(),
    actualizado_en: nota.actualizadoEn!.toISOString(),
  };
}
