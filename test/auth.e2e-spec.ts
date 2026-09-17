import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configurarAplicacion } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { Ambiente } from '../src/config/env.validation';
import { VerificadorIdentidad } from '../src/modules/auth/application/ports/verificador-identidad';
import { ErrorAutenticacion } from '../src/shared/application/error-autenticacion';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

// Flujo completo del Doc 5 Bloque 1 contra el Postgres local (DATABASE_URL
// del .env), con RLS real — es lo que valida que `enNegocio()` fija
// `app.negocio_actual` correctamente. Firebase se reemplaza por un doble: el
// ID token "valido-<uid>" se acepta con ese uid; cualquier otro se rechaza.
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const googleUid = `e2e-${randomUUID()}`;
  const idTokenValido = `valido-${googleUid}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VerificadorIdentidad)
      .useValue({
        verificar: async (idToken: string) => {
          if (!idToken.startsWith('valido-')) {
            throw new ErrorAutenticacion('ID_TOKEN_INVALIDO', 'inválido');
          }
          return { googleUid: idToken.slice('valido-'.length) };
        },
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configurarAplicacion(app, Ambiente.development);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cascada negocios → dispositivos (las FK ignoran RLS por diseño de Postgres).
    await prisma?.negocio.deleteMany({ where: { googleUid } });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('POST /auth/login con body inválido → 400 SOLICITUD_INVALIDA', async () => {
    const res = await http().post('/api/v1/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    expect(res.body.error.detalles.errores).toEqual(
      expect.arrayContaining([expect.stringContaining('id_token')]),
    );
  });

  it('POST /auth/login con ID token rechazado → 401 ID_TOKEN_INVALIDO', async () => {
    const res = await http().post('/api/v1/auth/login').send({ id_token: 'falso' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { codigo: 'ID_TOKEN_INVALIDO', mensaje: expect.any(String) },
    });
  });

  it('POST /auth/logout sin token → 401 TOKEN_AUSENTE (AuthGuard global)', async () => {
    const res = await http().post('/api/v1/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('TOKEN_AUSENTE');
  });

  describe('ciclo login → refresh → logout', () => {
    let accessToken: string;
    let refreshToken: string;
    let negocioId: string;

    it('login crea el Negocio implícitamente y una fila en dispositivos', async () => {
      const res = await http().post('/api/v1/auth/login').send({ id_token: idTokenValido });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        negocio: { id: expect.any(String), nombre_negocio: null },
      });
      ({ access_token: accessToken, refresh_token: refreshToken } = res.body);
      negocioId = res.body.negocio.id;

      const negocio = await prisma.negocio.findUnique({ where: { googleUid } });
      expect(negocio?.id).toBe(negocioId);

      // Sin fijar app.negocio_actual, RLS oculta la fila (falla cerrado).
      await expect(prisma.dispositivo.count({ where: { negocioId } })).resolves.toBe(0);
      // Con la variable fijada, la fila existe y guarda un hash, no el token.
      const dispositivos = await prisma.enNegocio(negocioId, (tx) =>
        tx.dispositivo.findMany({ where: { negocioId } }),
      );
      expect(dispositivos).toHaveLength(1);
      expect(dispositivos[0].refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(dispositivos[0].refreshTokenHash).not.toBe(refreshToken);
    });

    it('un segundo login del mismo uid reutiliza el Negocio y agrega otro dispositivo', async () => {
      const res = await http().post('/api/v1/auth/login').send({ id_token: idTokenValido });

      expect(res.status).toBe(200);
      expect(res.body.negocio.id).toBe(negocioId);
      const total = await prisma.enNegocio(negocioId, (tx) =>
        tx.dispositivo.count({ where: { negocioId } }),
      );
      expect(total).toBe(2);
    });

    it('refresh emite un nuevo access token', async () => {
      const res = await http().post('/api/v1/auth/refresh').send({ refresh_token: refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ access_token: expect.any(String) });
    });

    it('el refresh token no sirve como access token', async () => {
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.codigo).toBe('TOKEN_INVALIDO');
    });

    it('logout con el access token → 204 y elimina solo la fila de este dispositivo', async () => {
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
      const total = await prisma.enNegocio(negocioId, (tx) =>
        tx.dispositivo.count({ where: { negocioId } }),
      );
      expect(total).toBe(1);
    });

    it('tras el logout, el refresh token de ese dispositivo → 401 SESION_INVALIDA', async () => {
      const res = await http().post('/api/v1/auth/refresh').send({ refresh_token: refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error.codigo).toBe('SESION_INVALIDA');
    });

    it('logout repetido es idempotente (204)', async () => {
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
    });
  });
});
