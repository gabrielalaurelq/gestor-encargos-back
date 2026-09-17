import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurarAplicacion } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { Ambiente } from '../src/config/env.validation';
import { LIMITE_AUTH } from '../src/config/rate-limit.config';

// Doc 5, Bloque 4: /auth/login limitado por IP (~10/min). Cada archivo e2e
// levanta su propia app, así que el contador en memoria arranca en cero.
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configurarAplicacion(app, Ambiente.development);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it(`permite ${LIMITE_AUTH.default.limit} intentos de login por minuto y rechaza el siguiente con 429 LIMITE_EXCEDIDO`, async () => {
    const limite = LIMITE_AUTH.default.limit;

    for (let i = 0; i < limite; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ id_token: 'cualquiera' });
      // Firebase real no está configurado en dev: el intento falla, pero
      // sigue contando contra el límite (eso es lo que se mide).
      expect([401, 500]).toContain(res.status);
      expect(res.headers['x-ratelimit-remaining']).toBe(String(limite - i - 1));
    }

    const bloqueada = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ id_token: 'cualquiera' });

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body).toEqual({
      error: {
        codigo: 'LIMITE_EXCEDIDO',
        mensaje: expect.stringContaining('Demasiadas peticiones'),
      },
    });
    expect(Number(bloqueada.headers['retry-after'])).toBeGreaterThan(0);
  });
});
