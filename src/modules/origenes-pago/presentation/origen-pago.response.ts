import { ApiProperty } from '@nestjs/swagger';
import { OrigenPagoCatalogo } from '../application/ports/origen-pago.repository';

export class OrigenPagoResponse {
  @ApiProperty({ example: 3 })
  id!: number;

  @ApiProperty({ example: 'Yape' })
  nombre!: string;

  @ApiProperty({
    description:
      'Un origen desactivado ya no se acepta en pagos nuevos (ORIGEN_PAGO_INVALIDO), pero ' +
      'se lista para nombrar los pagos que ya lo usan.',
  })
  activo!: boolean;
}

export function aOrigenPagoResponse(origen: OrigenPagoCatalogo): OrigenPagoResponse {
  return { id: origen.id, nombre: origen.nombre, activo: origen.activo };
}
