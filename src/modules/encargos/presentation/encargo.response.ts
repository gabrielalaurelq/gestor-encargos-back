import { ApiProperty } from '@nestjs/swagger';
import { isoDesdeFecha } from '../../../shared/domain/fecha';
import { AdvertenciaEncargo, Encargo } from '../domain/encargo';
import { EstadoEncargo } from '../domain/estado-encargo';

export class EncargoResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  cliente_id!: string;

  @ApiProperty({
    nullable: true,
    example: 47,
    description: 'null = "Pendiente": el dispositivo agotó su bloque sin conexión (Doc 4).',
  })
  numero!: number | null;

  @ApiProperty()
  descripcion!: string;

  @ApiProperty({ enum: EstadoEncargo })
  estado!: EstadoEncargo;

  @ApiProperty({ example: 0, description: 'Σ(precio de los Trabajos) − descuento. Calculado.' })
  precio_total!: number;

  @ApiProperty({ example: 0 })
  descuento!: number;

  @ApiProperty({
    example: 0,
    description: 'precio_total − Σ(pagos). Puede ser negativo: saldo a favor del cliente.',
  })
  saldo_pendiente!: number;

  @ApiProperty({
    example: '2026-10-15',
    description: 'Primer compromiso comunicado al cliente. No cambia nunca (Doc 2, invariante 6).',
  })
  fecha_entrega_prometida!: string;

  @ApiProperty({
    example: '2026-10-20',
    description: 'Compromiso vigente. Es la que leen las alertas de atraso, no la prometida.',
  })
  fecha_entrega_acordada!: string;

  @ApiProperty({ nullable: true, description: 'Automática al pasar a LISTO.' })
  fecha_listo!: string | null;

  @ApiProperty({ nullable: true, description: 'Automática al pasar a ENTREGADO.' })
  fecha_entrega_real!: string | null;

  @ApiProperty({ nullable: true })
  ubicacion_fisica!: string | null;

  @ApiProperty({ nullable: true })
  notas_generales!: string | null;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({ format: 'date-time' })
  actualizado_en!: string;
}

export class EncargoConAdvertenciasResponse extends EncargoResponse {
  @ApiProperty({
    isArray: true,
    description:
      'Avisos no bloqueantes: la operación ya se aplicó. Hoy solo SALDO_PENDIENTE, al entregar ' +
      'un encargo con saldo a cobrar (Doc 2, invariante 10 — se puede vender fiado).',
    example: [{ codigo: 'SALDO_PENDIENTE', mensaje: 'Queda un saldo pendiente de S/ 30.00.' }],
  })
  advertencias!: AdvertenciaEncargo[];
}

// Las 4 fechas del Encargo son DATE sin hora (Doc 4), así que salen como
// AAAA-MM-DD; `creado_en`/`actualizado_en` sí son timestamps completos.
export function aEncargoResponse(encargo: Encargo): EncargoResponse {
  const fechas = encargo.fechas;

  return {
    id: encargo.id,
    cliente_id: encargo.clienteId,
    numero: encargo.numero,
    descripcion: encargo.descripcion,
    estado: encargo.estado,
    precio_total: encargo.precioTotal.soles,
    descuento: encargo.descuento.soles,
    saldo_pendiente: encargo.saldoPendiente.soles,
    fecha_entrega_prometida: isoDesdeFecha(fechas.entregaPrometida),
    fecha_entrega_acordada: isoDesdeFecha(fechas.entregaAcordada),
    fecha_listo: fechas.listo ? isoDesdeFecha(fechas.listo) : null,
    fecha_entrega_real: fechas.entregaReal ? isoDesdeFecha(fechas.entregaReal) : null,
    ubicacion_fisica: encargo.ubicacionFisica,
    notas_generales: encargo.notasGenerales,
    creado_en: encargo.creadoEn!.toISOString(),
    actualizado_en: encargo.actualizadoEn!.toISOString(),
  };
}

export class BloqueNumerosResponse {
  @ApiProperty({ example: 1 })
  desde!: number;

  @ApiProperty({ example: 100 })
  hasta!: number;
}
