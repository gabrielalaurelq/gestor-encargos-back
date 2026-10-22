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

// Doc 5 v1.6 — "Orígenes de pago": el catálogo que la app guarda en Drift
// para registrar pagos (S3c).
describe('Orígenes de pago (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const uid = `origenes-${randomUUID()}`;
  let token: string;

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

    const res = await http()
      .post('/api/v1/auth/login')
      .send({ id_token: `valido-${uid}` });
    token = res.body.access_token;
  });

  afterAll(async () => {
    await prisma?.negocio.deleteMany({ where: { googleUid: uid } });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('sin token → 401', async () => {
    expect((await http().get('/api/v1/origenes-pago')).status).toBe(401);
  });

  it('devuelve los cuatro de la semilla, por id, sin paginar', async () => {
    const res = await http().get('/api/v1/origenes-pago').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((o: { nombre: string }) => o.nombre)).toEqual([
      'Efectivo',
      'Transferencia',
      'Yape',
      'Plin',
    ]);
    for (const origen of res.body) {
      expect(origen).toEqual({ id: expect.any(Number), nombre: expect.any(String), activo: true });
    }
    const ids = res.body.map((o: { id: number }) => o.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  describe('con un origen desactivado', () => {
    let plinId: number;

    beforeAll(async () => {
      plinId = (await prisma.origenPago.findUniqueOrThrow({ where: { nombre: 'Plin' } })).id;
      await prisma.origenPago.update({ where: { id: plinId }, data: { activo: false } });
    });

    afterAll(async () => {
      await prisma.origenPago.update({ where: { id: plinId }, data: { activo: true } });
    });

    it('lo sigue listando, con activo: false, para nombrar pagos viejos', async () => {
      const res = await http().get('/api/v1/origenes-pago').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toContainEqual({ id: plinId, nombre: 'Plin', activo: false });
      expect(res.body).toHaveLength(4);
    });
  });
});
