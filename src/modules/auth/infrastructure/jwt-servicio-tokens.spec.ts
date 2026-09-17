import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtServicioTokens } from './jwt-servicio-tokens';

describe('JwtServicioTokens', () => {
  const secreto = 'secreto-de-prueba-suficientemente-largo-para-hs256';
  const jwt = new JwtService({ secret: secreto });
  const config = new ConfigService({
    JWT_ACCESS_EXPIRES_IN: '30m',
    JWT_REFRESH_EXPIRES_IN: '90d',
  });
  const servicio = new JwtServicioTokens(jwt, config);
  const sesion = { negocioId: 'negocio-1', dispositivoId: 'disp-1' };

  it('un access token emitido se verifica y devuelve la misma sesión', async () => {
    const token = await servicio.emitirAccess(sesion);

    await expect(servicio.verificarAccess(token)).resolves.toEqual(sesion);
  });

  it('un refresh token emitido se verifica como refresh', async () => {
    const token = await servicio.emitirRefresh(sesion);

    await expect(servicio.verificarRefresh(token)).resolves.toEqual(sesion);
  });

  it('un refresh token NO sirve como access token (ni al revés)', async () => {
    const refresh = await servicio.emitirRefresh(sesion);
    const access = await servicio.emitirAccess(sesion);

    await expect(servicio.verificarAccess(refresh)).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
    });
    await expect(servicio.verificarRefresh(access)).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
    });
  });

  it('dos refresh tokens de la misma sesión son distintos (jti aleatorio)', async () => {
    const a = await servicio.emitirRefresh(sesion);
    const b = await servicio.emitirRefresh(sesion);

    expect(a).not.toBe(b);
    expect(servicio.hash(a)).not.toBe(servicio.hash(b));
  });

  it('distingue TOKEN_EXPIRADO de TOKEN_INVALIDO', async () => {
    const expirado = await jwt.signAsync(
      { dis: 'disp-1', tipo: 'access' },
      { subject: 'negocio-1', expiresIn: '-10s' },
    );
    const otroSecreto = await new JwtService({
      secret: 'otro-secreto-distinto-al-de-la-app',
    }).signAsync({ dis: 'disp-1', tipo: 'access' }, { subject: 'negocio-1', expiresIn: '30m' });

    await expect(servicio.verificarAccess(expirado)).rejects.toMatchObject({
      codigo: 'TOKEN_EXPIRADO',
    });
    await expect(servicio.verificarAccess(otroSecreto)).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
    });
    await expect(servicio.verificarAccess('no-es-un-jwt')).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
    });
  });

  it('el hash es SHA-256 hex, determinista', () => {
    expect(servicio.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(servicio.hash('abc')).toBe(servicio.hash('abc'));
  });
});
