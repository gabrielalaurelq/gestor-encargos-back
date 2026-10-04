import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { crearIdempotente } from '../../../../shared/application/crear-idempotente';
import { ClienteRepository } from '../../../clientes/domain/repositories/cliente.repository';
import { Encargo } from '../../domain/encargo';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { CrearEncargoDto } from '../dto/crear-encargo.dto';

export interface ResultadoCrearEncargo {
  encargo: Encargo;
  creado: boolean;
}

/** `POST /encargos` (Doc 5, Bloque 2 — Caso 7). Idempotente por el UUID del dispositivo. */
@Injectable()
export class CrearEncargoUseCase {
  constructor(
    private readonly repositorio: EncargoRepository,
    private readonly clientes: ClienteRepository,
  ) {}

  async execute(dto: CrearEncargoDto): Promise<ResultadoCrearEncargo> {
    const { recurso, creado } = await crearIdempotente({
      id: dto.id,
      buscar: (id) => this.repositorio.buscarPorId(id),
      crear: async () => {
        // El cliente tiene que existir y ser de este negocio. Sin esta
        // comprobación, la FK daría un error de Prisma que terminaría en 500;
        // el payload está bien formado pero referencia algo inválido → 422.
        // Un cliente de otro negocio simplemente no se ve (filtro + RLS), así
        // que cae por el mismo camino.
        if (!(await this.clientes.buscarPorId(dto.cliente_id))) {
          throw new UnprocessableEntityException({
            codigo: 'CLIENTE_NO_ENCONTRADO',
            mensaje: 'El cliente indicado no existe en este negocio.',
            detalles: { cliente_id: dto.cliente_id },
          });
        }

        return this.repositorio.crear(
          Encargo.crear({
            id: dto.id,
            clienteId: dto.cliente_id,
            numero: dto.numero,
            descripcion: dto.descripcion,
            fechaEntregaAcordada: dto.fecha_entrega_acordada,
            descuento: dto.descuento,
            ubicacionFisica: dto.ubicacion_fisica,
            notasGenerales: dto.notas_generales,
          }),
        );
      },
    });

    return { encargo: recurso, creado };
  }
}
