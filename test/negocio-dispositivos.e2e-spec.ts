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

// Doc 5 Bloque 2 — "Negocio (propio)" y "Dispositivos". Los cuatro endpoints
// que faltaban del Bloque 2.
describe('Negocio y dispositivos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `negocio-A-${marca}`;
  const uidB = `negocio-B-${marca}`;
  let tokenA: string;
  let tokenA2: string;
  let tokenB: string;
  let negocioIdA: string;

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

    const sesionA = await login(uidA);
    tokenA = sesionA.access;
    negocioIdA = sesionA.negocioId;
    // Segundo login del mismo uid = segundo dispositivo del mismo negocio.
    tokenA2 = (await login(uidA)).access;
    tokenB = (await login(uidB)).access;
  });

  afterAll(async () => {
    await prisma?.negocio.deleteMany({ where: { googleUid: { in: [uidA, uidB] } } });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function login(uid: string): Promise<{ access: string; negocioId: string }> {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ id_token: `valido-${uid}` });
    return { access: res.body.access_token, negocioId: res.body.negocio.id };
  }

  const conA = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenA}`);
  const conA2 = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenA2}`);
  const conB = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenB}`);

  describe('GET /negocio', () => {
    it('sin token → 401', async () => {
      expect((await http().get('/api/v1/negocio')).status).toBe(401);
    });

    it('devuelve el negocio de la sesión, con el plan y sin datos internos', async () => {
      const res = await conA(http().get('/api/v1/negocio'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: negocioIdA,
        // Nace sin nombre (Doc 5, Bloque 1).
        nombre_negocio: null,
        plan: 'FREE',
        plan_vence_en: null,
        // PRD 13: funciona por defecto, sin configuración inicial obligatoria.
        dias_aviso_no_recoge: 2,
        creado_en: expect.any(String),
        actualizado_en: expect.any(String),
      });
      // No se expone el identificador del proveedor de identidad ni el
      // contador interno de numeración.
      expect(res.body.google_uid).toBeUndefined();
      expect(res.body.siguiente_bloque_numeros).toBeUndefined();
    });

    it('cada negocio ve el suyo', async () => {
      const deB = await conB(http().get('/api/v1/negocio'));

      expect(deB.body.id).not.toBe(negocioIdA);
    });

    it('los dos dispositivos del mismo negocio ven el mismo negocio', async () => {
      const uno = await conA(http().get('/api/v1/negocio'));
      const otro = await conA2(http().get('/api/v1/negocio'));

      expect(otro.body.id).toBe(uno.body.id);
    });
  });

  describe('PATCH /negocio', () => {
    it('pone el nombre', async () => {
      const res = await conA(http().patch('/api/v1/negocio')).send({
        nombre_negocio: '  Sastrería La Esperanza  ',
      });

      expect(res.status).toBe(200);
      expect(res.body.nombre_negocio).toBe('Sastrería La Esperanza');
    });

    it('una cadena vacía lo deja sin nombre: el campo es opcional', async () => {
      await conA(http().patch('/api/v1/negocio')).send({ nombre_negocio: 'Algo' });

      const res = await conA(http().patch('/api/v1/negocio')).send({ nombre_negocio: '   ' });

      expect(res.status).toBe(200);
      expect(res.body.nombre_negocio).toBeNull();
    });

    it('null también lo deja sin nombre', async () => {
      await conA(http().patch('/api/v1/negocio')).send({ nombre_negocio: 'Algo' });

      const res = await conA(http().patch('/api/v1/negocio')).send({ nombre_negocio: null });

      expect(res.body.nombre_negocio).toBeNull();
    });

    it('cambia el umbral de "Cliente no recoge" sin tocar el nombre', async () => {
      await conA(http().patch('/api/v1/negocio')).send({ nombre_negocio: 'Taller' });

      const res = await conA(http().patch('/api/v1/negocio')).send({ dias_aviso_no_recoge: 5 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ nombre_negocio: 'Taller', dias_aviso_no_recoge: 5 });
    });

    it.each([[0], [31], [2.5], ['3']])('umbral %j → 400', async (valor) => {
      const res = await conA(http().patch('/api/v1/negocio')).send({
        dias_aviso_no_recoge: valor,
      });

      expect(res.status).toBe(400);
    });

    it('un cuerpo vacío no cambia nada ni mueve actualizado_en', async () => {
      const antes = await conA(http().get('/api/v1/negocio'));

      const res = await conA(http().patch('/api/v1/negocio')).send({});

      expect(res.body.actualizado_en).toBe(antes.body.actualizado_en);
    });

    it('repetir el mismo nombre no mueve actualizado_en', async () => {
      const puesto = await conA(http().patch('/api/v1/negocio')).send({
        nombre_negocio: 'Estable',
      });

      const igual = await conA(http().patch('/api/v1/negocio')).send({
        nombre_negocio: 'Estable',
      });

      expect(igual.body.actualizado_en).toBe(puesto.body.actualizado_en);
    });

    it('ignora campos que no son editables (whitelist)', async () => {
      const res = await conA(http().patch('/api/v1/negocio')).send({
        nombre_negocio: 'Con extras',
        plan: 'PREMIUM',
        siguiente_bloque_numeros: 9999,
      });

      expect(res.status).toBe(200);
      // El plan lo mueve la pasarela de pago, nunca este endpoint (Doc 10).
      expect(res.body.plan).toBe('FREE');
    });

    it('un nombre demasiado largo → 400', async () => {
      const res = await conA(http().patch('/api/v1/negocio')).send({
        nombre_negocio: 'x'.repeat(121),
      });

      expect(res.status).toBe(400);
    });

    it('editar el nombre no afecta al otro negocio', async () => {
      await conA(http().patch('/api/v1/negocio')).send({ nombre_negocio: 'Solo de A' });

      const deB = await conB(http().get('/api/v1/negocio'));
      expect(deB.body.nombre_negocio).not.toBe('Solo de A');
    });
  });

  describe('POST /dispositivos/fcm-token', () => {
    it('registra el token en la fila de este dispositivo', async () => {
      const token = `fcm-${randomUUID()}`;

      const res = await conA(http().post('/api/v1/dispositivos/fcm-token')).send({
        fcm_token: token,
      });

      expect(res.status).toBe(204);
      const filas = await prisma.enNegocio(negocioIdA, (tx) =>
        tx.dispositivo.findMany({ where: { fcmToken: token } }),
      );
      expect(filas).toHaveLength(1);
    });

    it('un token vacío → 400', async () => {
      const res = await conA(http().post('/api/v1/dispositivos/fcm-token')).send({
        fcm_token: '',
      });

      expect(res.status).toBe(400);
    });

    it('sin token de sesión → 401', async () => {
      const res = await http().post('/api/v1/dispositivos/fcm-token').send({ fcm_token: 'x' });

      expect(res.status).toBe(401);
    });

    it('reenviar el mismo token es idempotente', async () => {
      const token = `fcm-${randomUUID()}`;

      await conA(http().post('/api/v1/dispositivos/fcm-token')).send({ fcm_token: token });
      const repetido = await conA(http().post('/api/v1/dispositivos/fcm-token')).send({
        fcm_token: token,
      });

      expect(repetido.status).toBe(204);
    });

    it('si otro dispositivo del mismo negocio lo tenía, se le suelta', async () => {
      // Firebase reasigna el mismo token cuando la app se reinstala.
      const token = `fcm-${randomUUID()}`;
      await conA(http().post('/api/v1/dispositivos/fcm-token')).send({ fcm_token: token });

      const res = await conA2(http().post('/api/v1/dispositivos/fcm-token')).send({
        fcm_token: token,
      });

      expect(res.status).toBe(204);
      // El token acabó en una sola fila: la del segundo dispositivo.
      const filas = await prisma.enNegocio(negocioIdA, (tx) =>
        tx.dispositivo.findMany({ where: { fcmToken: token } }),
      );
      expect(filas).toHaveLength(1);
    });

    it('si lo tiene un dispositivo de otro negocio → 409 FCM_TOKEN_EN_USO', async () => {
      // RLS no deja ver ni limpiar la fila ajena, y el UNIQUE es global.
      const token = `fcm-${randomUUID()}`;
      await conB(http().post('/api/v1/dispositivos/fcm-token')).send({ fcm_token: token });

      const res = await conA(http().post('/api/v1/dispositivos/fcm-token')).send({
        fcm_token: token,
      });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('FCM_TOKEN_EN_USO');
    });
  });

  describe('DELETE /dispositivos/fcm-token', () => {
    it('silencia las notificaciones sin cerrar la sesión', async () => {
      const token = `fcm-${randomUUID()}`;
      await conA(http().post('/api/v1/dispositivos/fcm-token')).send({ fcm_token: token });

      const res = await conA(http().delete('/api/v1/dispositivos/fcm-token'));

      expect(res.status).toBe(204);
      // La fila sigue existiendo: la sesión no se cerró.
      const sigueValiendo = await conA(http().get('/api/v1/negocio'));
      expect(sigueValiendo.status).toBe(200);

      const conEseToken = await prisma.enNegocio(negocioIdA, (tx) =>
        tx.dispositivo.findMany({ where: { fcmToken: token } }),
      );
      expect(conEseToken).toEqual([]);
    });

    it('es idempotente: borrar un token que ya no estaba no falla', async () => {
      await conA(http().delete('/api/v1/dispositivos/fcm-token'));

      expect((await conA(http().delete('/api/v1/dispositivos/fcm-token'))).status).toBe(204);
    });

    it('tras el logout la fila entera desaparece, no solo el token', async () => {
      const { access } = await login(uidA);
      const conNuevo = (peticion: request.Test) =>
        peticion.set('Authorization', `Bearer ${access}`);

      await conNuevo(http().post('/api/v1/dispositivos/fcm-token')).send({
        fcm_token: `fcm-${randomUUID()}`,
      });
      await conNuevo(http().post('/api/v1/auth/logout'));

      // El access token sigue siendo criptográficamente válido hasta vencer
      // —el AuthGuard no consulta la base en cada petición, por diseño—, pero
      // el dispositivo ya no tiene fila. Registrar su token ahora no es un
      // error interno: la sesión dejó de existir.
      const res = await conNuevo(http().post('/api/v1/dispositivos/fcm-token')).send({
        fcm_token: `fcm-${randomUUID()}`,
      });
      expect(res.status).toBe(401);
      expect(res.body.error.codigo).toBe('SESION_INVALIDA');
    });
  });
});
