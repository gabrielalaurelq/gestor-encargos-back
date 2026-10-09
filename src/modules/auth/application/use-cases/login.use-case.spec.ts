import { ErrorAutenticacion } from '../../../../shared/application/error-autenticacion';
import { AuthRepository } from '../ports/auth.repository';
import { ServicioTokens } from '../ports/servicio-tokens';
import { VerificadorIdentidad } from '../ports/verificador-identidad';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  const verificador: jest.Mocked<VerificadorIdentidad> = { verificar: jest.fn() };
  const repositorio: jest.Mocked<AuthRepository> = {
    buscarOCrearNegocio: jest.fn(),
    crearDispositivo: jest.fn(),
    existeDispositivo: jest.fn(),
    eliminarDispositivo: jest.fn(),
    fijarFcmToken: jest.fn(),
  };
  const tokens: jest.Mocked<ServicioTokens> = {
    emitirAccess: jest.fn(),
    emitirRefresh: jest.fn(),
    verificarAccess: jest.fn(),
    verificarRefresh: jest.fn(),
    hash: jest.fn(),
  };
  const casoUso = new LoginUseCase(verificador, repositorio, tokens);

  beforeEach(() => {
    jest.resetAllMocks();
    verificador.verificar.mockResolvedValue({ googleUid: 'uid-google' });
    repositorio.buscarOCrearNegocio.mockResolvedValue({ id: 'negocio-1', nombreNegocio: null });
    tokens.emitirRefresh.mockResolvedValue('refresh.jwt');
    tokens.emitirAccess.mockResolvedValue('access.jwt');
    tokens.hash.mockImplementation((t) => `sha256(${t})`);
  });

  it('crea/busca el negocio por google_uid y devuelve ambos tokens', async () => {
    const resultado = await casoUso.execute('id-token');

    expect(repositorio.buscarOCrearNegocio).toHaveBeenCalledWith('uid-google');
    expect(resultado).toEqual({
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      negocio: { id: 'negocio-1', nombreNegocio: null },
    });
  });

  it('guarda el HASH del refresh token (nunca el valor plano) en una fila nueva de dispositivos', async () => {
    await casoUso.execute('id-token');

    expect(repositorio.crearDispositivo).toHaveBeenCalledTimes(1);
    const [negocioId, dispositivoId, hash] = repositorio.crearDispositivo.mock.calls[0];
    expect(negocioId).toBe('negocio-1');
    expect(dispositivoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(hash).toBe('sha256(refresh.jwt)');
  });

  it('emite ambos tokens para la misma sesión (negocioId + dispositivoId)', async () => {
    await casoUso.execute('id-token');

    const sesionRefresh = tokens.emitirRefresh.mock.calls[0][0];
    const sesionAccess = tokens.emitirAccess.mock.calls[0][0];
    expect(sesionAccess).toEqual(sesionRefresh);
    expect(sesionAccess.negocioId).toBe('negocio-1');
  });

  it('no toca la base de datos si el ID token de Google es inválido', async () => {
    verificador.verificar.mockRejectedValue(
      new ErrorAutenticacion('ID_TOKEN_INVALIDO', 'inválido'),
    );

    await expect(casoUso.execute('malo')).rejects.toMatchObject({ codigo: 'ID_TOKEN_INVALIDO' });
    expect(repositorio.buscarOCrearNegocio).not.toHaveBeenCalled();
    expect(repositorio.crearDispositivo).not.toHaveBeenCalled();
  });
});
