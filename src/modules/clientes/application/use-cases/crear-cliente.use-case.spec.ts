import { ConflictException } from '@nestjs/common';
import { Cliente } from '../../domain/cliente';
import {
  ClienteDuplicadoError,
  ClienteRepository,
} from '../../domain/repositories/cliente.repository';
import { CrearClienteUseCase } from './crear-cliente.use-case';

const ID = '11111111-2222-3333-4444-555555555555';

function clientePersistido(nombre: string): Cliente {
  return Cliente.reconstituir({
    id: ID,
    nombre,
    telefono: null,
    creadoEn: new Date('2026-09-01T10:00:00Z'),
    actualizadoEn: new Date('2026-09-01T10:00:00Z'),
  });
}

describe('CrearClienteUseCase', () => {
  let repositorio: jest.Mocked<ClienteRepository>;
  let useCase: CrearClienteUseCase;

  beforeEach(() => {
    repositorio = {
      buscarPorId: jest.fn(),
      listar: jest.fn(),
      crear: jest.fn(),
      actualizar: jest.fn(),
    } as unknown as jest.Mocked<ClienteRepository>;
    useCase = new CrearClienteUseCase(repositorio);
  });

  it('sin id: no consulta antes, crea y marca creado=true (201)', async () => {
    repositorio.crear.mockImplementation(async (cliente) => cliente);

    const resultado = await useCase.execute({ nombre: 'Ana' });

    expect(repositorio.buscarPorId).not.toHaveBeenCalled();
    expect(resultado.creado).toBe(true);
    expect(resultado.cliente.nombre).toBe('Ana');
  });

  it('con id nuevo: crea respetando el id del dispositivo', async () => {
    repositorio.buscarPorId.mockResolvedValue(null);
    repositorio.crear.mockImplementation(async (cliente) => cliente);

    const resultado = await useCase.execute({ id: ID, nombre: 'Ana' });

    expect(resultado.creado).toBe(true);
    expect(resultado.cliente.id).toBe(ID);
  });

  it('con id ya existente: devuelve el existente sin escribir (200, reintento del Outbox)', async () => {
    repositorio.buscarPorId.mockResolvedValue(clientePersistido('Ana'));

    const resultado = await useCase.execute({ id: ID, nombre: 'Nombre distinto' });

    expect(repositorio.crear).not.toHaveBeenCalled();
    expect(resultado.creado).toBe(false);
    // No se pisa lo que ya estaba: un reintento no es una edición.
    expect(resultado.cliente.nombre).toBe('Ana');
  });

  it('carrera entre dos reintentos: el que pierde relee y devuelve el existente', async () => {
    repositorio.buscarPorId
      .mockResolvedValueOnce(null) // comprobación previa: todavía no existe
      .mockResolvedValueOnce(clientePersistido('Ana')); // relectura tras el choque
    repositorio.crear.mockRejectedValue(new ClienteDuplicadoError(ID));

    const resultado = await useCase.execute({ id: ID, nombre: 'Ana' });

    expect(resultado.creado).toBe(false);
    expect(resultado.cliente.nombre).toBe('Ana');
  });

  it('id ya usado por otro negocio: 409 neutro, no 500 ni filtración', async () => {
    // Choca con la llave primaria (global) pero la fila no es visible para
    // esta sesión: pertenece a otro negocio.
    repositorio.buscarPorId.mockResolvedValue(null);
    repositorio.crear.mockRejectedValue(new ClienteDuplicadoError(ID));

    const promesa = useCase.execute({ id: ID, nombre: 'Ana' });

    await expect(promesa).rejects.toThrow(ConflictException);
    await expect(promesa).rejects.toThrow('El id enviado ya está en uso.');
  });

  it('propaga cualquier otro error del repositorio', async () => {
    repositorio.crear.mockRejectedValue(new Error('conexión caída'));

    await expect(useCase.execute({ nombre: 'Ana' })).rejects.toThrow('conexión caída');
  });

  it('valida el dominio antes de tocar la base', async () => {
    await expect(useCase.execute({ nombre: '  ' })).rejects.toThrow(
      expect.objectContaining({ codigo: 'CLIENTE_NOMBRE_VACIO' }),
    );
    await expect(useCase.execute({ nombre: 'Ana', telefono: '987654321' })).rejects.toThrow(
      expect.objectContaining({ codigo: 'TELEFONO_INVALIDO' }),
    );
    expect(repositorio.crear).not.toHaveBeenCalled();
  });
});
