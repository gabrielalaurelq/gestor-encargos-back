import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ServicioTokens } from '../../application/ports/servicio-tokens';
import { AuthGuard, extraerBearer } from './auth.guard';

function contextoCon(headers: Record<string, string>, publico = false) {
  const request: { headers: Record<string, string>; sesion?: unknown } = { headers };
  const contexto = {
    getHandler: () => (publico ? 'handlerPublico' : 'handler'),
    getClass: () => 'clase',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { contexto, request };
}

describe('extraerBearer', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer abc', 'abc'],
    ['Basic abc', undefined],
    ['Bearer', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('%p → %p', (header, esperado) => {
    expect(extraerBearer(header)).toBe(esperado);
  });
});

describe('AuthGuard', () => {
  const tokens: jest.Mocked<ServicioTokens> = {
    emitirAccess: jest.fn(),
    emitirRefresh: jest.fn(),
    verificarAccess: jest.fn(),
    verificarRefresh: jest.fn(),
    hash: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(
      (_clave: string, [handler]: unknown[]) => handler === 'handlerPublico',
    ),
  } as unknown as Reflector;
  const guard = new AuthGuard(reflector, tokens);

  beforeEach(() => jest.clearAllMocks());

  it('deja pasar rutas @Public() sin mirar el token', async () => {
    const { contexto } = contextoCon({}, true);

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(tokens.verificarAccess).not.toHaveBeenCalled();
  });

  it('rechaza con TOKEN_AUSENTE si no hay Authorization: Bearer', async () => {
    const { contexto } = contextoCon({});

    await expect(guard.canActivate(contexto)).rejects.toMatchObject({ codigo: 'TOKEN_AUSENTE' });
  });

  it('deja la sesión en la request cuando el token es válido', async () => {
    const sesion = { negocioId: 'negocio-1', dispositivoId: 'disp-1' };
    tokens.verificarAccess.mockResolvedValue(sesion);
    const { contexto, request } = contextoCon({ authorization: 'Bearer token.valido' });

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(tokens.verificarAccess).toHaveBeenCalledWith('token.valido');
    expect(request.sesion).toEqual(sesion);
  });
});
