import { Cliente } from '../../domain/cliente';
import { ClienteRepository } from '../../domain/repositories/cliente.repository';
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

// La mecánica de la idempotencia (reintentos, carrera, 409) se prueba una sola
// vez en `shared/application/crear-idempotente.spec.ts`. Acá solo lo propio
// del módulo: que el id del dispositivo se respete, que un reintento no pise
// lo ya guardado y que el dominio se valide antes de tocar la base.
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

  it('sin id: crea y marca creado=true (201)', async () => {
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

  it('con id ya existente: devuelve el existente sin pisar sus datos', async () => {
    repositorio.buscarPorId.mockResolvedValue(clientePersistido('Ana'));

    const resultado = await useCase.execute({ id: ID, nombre: 'Nombre distinto' });

    expect(repositorio.crear).not.toHaveBeenCalled();
    expect(resultado.creado).toBe(false);
    // Un reintento no es una edición.
    expect(resultado.cliente.nombre).toBe('Ana');
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
