import { ErrorAutenticacion } from '../../../../shared/application/error-autenticacion';
import { AuthRepository } from '../ports/auth.repository';
import { ServicioTokens } from '../ports/servicio-tokens';
import { RefrescarSesionUseCase } from './refrescar-sesion.use-case';

describe('RefrescarSesionUseCase', () => {
  const repositorio: jest.Mocked<AuthRepository> = {
    buscarOCrearNegocio: jest.fn(),
    crearDispositivo: jest.fn(),
    existeDispositivo: jest.fn(),
    eliminarDispositivo: jest.fn(),
  };
  const tokens: jest.Mocked<ServicioTokens> = {
    emitirAccess: jest.fn(),
    emitirRefresh: jest.fn(),
    verificarAccess: jest.fn(),
    verificarRefresh: jest.fn(),
    hash: jest.fn(),
  };
  const casoUso = new RefrescarSesionUseCase(repositorio, tokens);
  const sesion = { negocioId: 'negocio-1', dispositivoId: 'disp-1' };

  beforeEach(() => {
    jest.resetAllMocks();
    tokens.verificarRefresh.mockResolvedValue(sesion);
    tokens.hash.mockImplementation((t) => `sha256(${t})`);
    tokens.emitirAccess.mockResolvedValue('access.nuevo');
  });

  it('emite un nuevo access token si la sesión sigue en dispositivos', async () => {
    repositorio.existeDispositivo.mockResolvedValue(true);

    await expect(casoUso.execute('refresh.jwt')).resolves.toEqual({ accessToken: 'access.nuevo' });
    expect(repositorio.existeDispositivo).toHaveBeenCalledWith(
      'negocio-1',
      'disp-1',
      'sha256(refresh.jwt)',
    );
    expect(tokens.emitirAccess).toHaveBeenCalledWith(sesion);
  });

  it('responde SESION_INVALIDA si la fila ya no existe (logout previo)', async () => {
    repositorio.existeDispositivo.mockResolvedValue(false);

    await expect(casoUso.execute('refresh.jwt')).rejects.toMatchObject({
      codigo: 'SESION_INVALIDA',
    });
    expect(tokens.emitirAccess).not.toHaveBeenCalled();
  });

  it('propaga TOKEN_EXPIRADO sin consultar la base de datos', async () => {
    tokens.verificarRefresh.mockRejectedValue(new ErrorAutenticacion('TOKEN_EXPIRADO', 'x'));

    await expect(casoUso.execute('viejo')).rejects.toMatchObject({ codigo: 'TOKEN_EXPIRADO' });
    expect(repositorio.existeDispositivo).not.toHaveBeenCalled();
  });
});
