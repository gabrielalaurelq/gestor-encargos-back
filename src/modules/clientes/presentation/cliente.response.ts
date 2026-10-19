import { ApiProperty } from '@nestjs/swagger';
import { Cliente } from '../domain/cliente';
import { FichaCliente } from '../application/use-cases/obtener-cliente.use-case';

// Doc 5: snake_case en las respuestas JSON. Este mapper es la única frontera
// entre el dominio (camelCase, Value Objects) y el contrato público.
export class ClienteResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ nullable: true, example: '+51987654321' })
  telefono!: string | null;

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Marca que usa el delta sync del Doc 5 Bloque 1 (LWW).',
  })
  actualizado_en!: string;
}

export function aClienteResponse(cliente: Cliente): ClienteResponse {
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefono: cliente.telefono?.valor ?? null,
    // Solo un Cliente reconstituido desde la base llega hasta acá, así que las
    // marcas siempre existen; el `!` lo afirma sin arrastrar opcionales al DTO.
    creado_en: cliente.creadoEn!.toISOString(),
    actualizado_en: cliente.actualizadoEn!.toISOString(),
  };
}

// PRD módulo 18. Solo la ficha (`GET /clientes/{id}`) lo trae: en el listado
// costaría tres consultas por fila, y el PRD lo ubica en la ficha.
export class HistorialClienteResponse {
  @ApiProperty({ example: 5, description: 'Activos + entregados + cancelados.' })
  total_encargos!: number;

  @ApiProperty({
    example: 350.5,
    description: 'Pagos no eliminados, incluidos los de encargos cancelados.',
  })
  total_pagado!: number;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: '`creado_en` del encargo más reciente ("Última visita").',
  })
  ultimo_encargo_en!: string | null;
}

export class ClienteDetalleResponse extends ClienteResponse {
  @ApiProperty({ type: HistorialClienteResponse })
  historial!: HistorialClienteResponse;
}

export function aClienteDetalleResponse(ficha: FichaCliente): ClienteDetalleResponse {
  const { historial } = ficha;
  return {
    ...aClienteResponse(ficha.cliente),
    historial: {
      total_encargos: historial.totalEncargos,
      total_pagado: historial.totalPagado.soles,
      ultimo_encargo_en: historial.ultimoEncargoEn?.toISOString() ?? null,
    },
  };
}
