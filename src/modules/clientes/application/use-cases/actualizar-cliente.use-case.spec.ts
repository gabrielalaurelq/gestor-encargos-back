import { NotFoundException } from '@nestjs/common';
import { Cliente } from '../../domain/cliente';
import { ClienteRepository } from '../../domain/repositories/cliente.repository';
import { ActualizarClienteUseCase } from './actualizar-cliente.use-case';

const ID = '11111111-2222-3333-4444-555555555555';

describe('ActualizarClienteUseCase', () => {
  let repositorio: jest.Mocked<ClienteRepository>;
  let useCase: ActualizarClienteUseCase;

  const existente = () =>
    Cliente.reconstituir({
      id: ID,
      nombre: 'Ana',
      telefono: '+51987654321',
      creadoEn: new Date('2026-09-01T10:00:00Z'),
      actualizadoEn: new Date('2026-09-01T10:00:00Z'),
    });

  beforeEach(() => {
    repositorio = {
      buscarPorId: jest.fn(),
      listar: jest.fn(),
      crear: jest.fn(),
      actualizar: jest.fn(),
    } as unknown as jest.Mocked<ClienteRepository>;
    useCase = new ActualizarClienteUseCase(repositorio);
  });

  it('404 cuando no existe — también si es de otro negocio (el filtro lo oculta)', async () => {
    repositorio.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute(ID, { nombre: 'Ana' })).rejects.toThrow(NotFoundException);
    expect(repositorio.actualizar).not.toHaveBeenCalled();
  });

  it('aplica el cambio y persiste', async () => {
    repositorio.buscarPorId.mockResolvedValue(existente());
    repositorio.actualizar.mockImplementation(async (cliente) => cliente);

    const resultado = await useCase.execute(ID, { nombre: 'Ana María' });

    expect(repositorio.actualizar).toHaveBeenCalledTimes(1);
    expect(resultado.nombre).toBe('Ana María');
  });

  it('un PATCH que no cambia nada no escribe (protege el delta sync)', async () => {
    repositorio.buscarPorId.mockResolvedValue(existente());

    const resultado = await useCase.execute(ID, { nombre: 'Ana' });

    expect(repositorio.actualizar).not.toHaveBeenCalled();
    expect(resultado.nombre).toBe('Ana');
  });

  it('telefono: null borra; omitirlo lo conserva', async () => {
    repositorio.buscarPorId.mockResolvedValue(existente());
    repositorio.actualizar.mockImplementation(async (cliente) => cliente);

    const borrado = await useCase.execute(ID, { telefono: null });
    expect(borrado.telefono).toBeNull();

    repositorio.buscarPorId.mockResolvedValue(existente());
    const conservado = await useCase.execute(ID, { nombre: 'Otra' });
    expect(conservado.telefono?.valor).toBe('+51987654321');
  });

  it('un teléfono inválido no llega a la base', async () => {
    repositorio.buscarPorId.mockResolvedValue(existente());

    await expect(useCase.execute(ID, { telefono: '987654321' })).rejects.toThrow(
      expect.objectContaining({ codigo: 'TELEFONO_INVALIDO' }),
    );
    expect(repositorio.actualizar).not.toHaveBeenCalled();
  });
});
