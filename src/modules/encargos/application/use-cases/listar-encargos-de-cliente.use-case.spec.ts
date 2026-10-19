import { NotFoundException } from '@nestjs/common';
import { Cliente } from '../../../clientes/domain/cliente';
import { ClienteRepository } from '../../../clientes/domain/repositories/cliente.repository';
import { EncargoRepository } from '../../domain/repositories/encargo.repository';
import { ListarEncargosDeClienteUseCase } from './listar-encargos-de-cliente.use-case';

const CLIENTE_ID = '11111111-2222-3333-4444-555555555555';

describe('ListarEncargosDeClienteUseCase', () => {
  let encargos: jest.Mocked<EncargoRepository>;
  let clientes: jest.Mocked<ClienteRepository>;
  let useCase: ListarEncargosDeClienteUseCase;

  beforeEach(() => {
    encargos = { listar: jest.fn() } as unknown as jest.Mocked<EncargoRepository>;
    clientes = { buscarPorId: jest.fn() } as unknown as jest.Mocked<ClienteRepository>;
    useCase = new ListarEncargosDeClienteUseCase(encargos, clientes);
  });

  it('404 si el cliente no existe — distinto de "sin encargos"', async () => {
    clientes.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute(CLIENTE_ID, { pagina: 1, por_pagina: 20 })).rejects.toThrow(
      NotFoundException,
    );
    expect(encargos.listar).not.toHaveBeenCalled();
  });

  it('filtra por cliente, ordena por recientes y respeta la paginación', async () => {
    clientes.buscarPorId.mockResolvedValue(
      Cliente.reconstituir({
        id: CLIENTE_ID,
        nombre: 'Ana',
        telefono: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      }),
    );
    encargos.listar.mockResolvedValue({ datos: [], total: 0 });

    await useCase.execute(CLIENTE_ID, { pagina: 2, por_pagina: 5 });

    expect(encargos.listar).toHaveBeenCalledWith({
      clienteId: CLIENTE_ID,
      orden: 'recientes',
      pagina: 2,
      porPagina: 5,
    });
  });
});
