import { ApiProperty } from '@nestjs/swagger';
import { CambiosSync } from '../application/ports/sync.repository';

export class SyncResponse {
  @ApiProperty({
    example: '2026-10-04T14:32:00.000Z',
    description:
      'Marca que el dispositivo guarda como su próximo `since`. Lleva un margen de solape ' +
      'hacia atrás para que ninguna fila escrita justo antes se pierda.',
  })
  servidor_timestamp!: string;

  @ApiProperty({
    description:
      'true si la respuesta se truncó: hay que volver a llamar con el `servidor_timestamp` ' +
      'devuelto para traer el resto.',
  })
  has_more!: boolean;

  @ApiProperty({
    description:
      'Las 9 colecciones del Doc 5, siempre presentes aunque vengan vacías. Cada fila trae sus ' +
      'llaves foráneas (`encargo_id`, `trabajo_id`…) porque el cliente recibe listas planas y ' +
      'tiene que reconstruir las relaciones en su base local.',
    example: {
      clientes: [{ id: '…', nombre: 'Ana', telefono: '+51987654321' }],
      encargos: [],
      objetos_recibidos: [],
      trabajos: [],
      materiales: [],
      pagos: [],
      notas: [],
      fotos: [],
      servicios: [],
    },
  })
  cambios!: CambiosSync;
}
