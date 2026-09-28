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

// Doc 5 Bloque 2 — Catálogo de servicios, contra el Postgres local con RLS
// real. Dos negocios para comprobar el aislamiento; el precio se verifica
// contra la columna DECIMAL(10,2), que es donde se vería cualquier pérdida de
// exactitud al pasar por el VO Monto.
describe('Servicios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `servicios-A-${marca}`;
  const uidB = `servicios-B-${marca}`;
  let tokenA: string;
  let tokenB: string;

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

    tokenA = await login(uidA);
    tokenB = await login(uidB);
  });

  afterAll(async () => {
    await prisma?.negocio.deleteMany({ where: { googleUid: { in: [uidA, uidB] } } });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function login(uid: string): Promise<string> {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ id_token: `valido-${uid}` });
    return res.body.access_token;
  }

  const comoA = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenA}`);
  const comoB = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenB}`);

  it('sin token → 401', async () => {
    expect((await http().get('/api/v1/servicios')).status).toBe(401);
  });

  describe('POST /servicios', () => {
    it('crea con 201 y devuelve el precio como número', async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({
        nombre: '  Basta de jean  ',
        precio: 20.5,
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        nombre: 'Basta de jean',
        precio: 20.5,
        activo: true,
        creado_en: expect.any(String),
        actualizado_en: expect.any(String),
      });
    });

    it('el precio llega intacto a DECIMAL(10,2)', async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'Precio con céntimos',
        precio: 0.07,
      });

      const negocioId = (await prisma.negocio.findUnique({ where: { googleUid: uidA } }))!.id;
      const fila = await prisma.enNegocio(negocioId, (tx) =>
        tx.servicio.findUnique({ where: { id: res.body.id } }),
      );

      expect(fila!.precio.toString()).toBe('0.07');
      expect(res.body.precio).toBe(0.07);
    });

    it('acepta precio 0 (PRD módulo 4)', async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'Retoque de garantía',
        precio: 0,
      });

      expect(res.status).toBe(201);
      expect(res.body.precio).toBe(0);
    });

    it('permite nombres duplicados (el MVP no los bloquea)', async () => {
      const uno = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'Duplicado',
        precio: 5,
      });
      const otro = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'Duplicado',
        precio: 9,
      });

      expect(uno.status).toBe(201);
      expect(otro.status).toBe(201);
      expect(otro.body.id).not.toBe(uno.body.id);
    });

    it('nombre vacío → 422 SERVICIO_NOMBRE_VACIO', async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({ nombre: ' ', precio: 5 });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('SERVICIO_NOMBRE_VACIO');
    });

    it('precio negativo → 422 SERVICIO_PRECIO_INVALIDO', async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({ nombre: 'X', precio: -1 });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('SERVICIO_PRECIO_INVALIDO');
    });

    it('precio con 3 decimales → 422 MONTO_INVALIDO, no se redondea', async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'X',
        precio: 20.555,
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('MONTO_INVALIDO');
    });

    it('precio que no es número → 400 (formato, antes del dominio)', async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'X',
        precio: 'veinte',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    });

    it('reintento con el mismo id → 200 con el existente', async () => {
      const id = randomUUID();
      const uno = await comoA(http().post('/api/v1/servicios')).send({
        id,
        nombre: 'Idempotente',
        precio: 10,
      });
      const reintento = await comoA(http().post('/api/v1/servicios')).send({
        id,
        nombre: 'Otro nombre',
        precio: 99,
      });

      expect(uno.status).toBe(201);
      expect(reintento.status).toBe(200);
      expect(reintento.body.nombre).toBe('Idempotente');
      expect(reintento.body.precio).toBe(10);
    });

    it('reusar el id de otro negocio → 409 neutro', async () => {
      const id = randomUUID();
      await comoA(http().post('/api/v1/servicios')).send({ id, nombre: 'De A', precio: 1 });

      const res = await comoB(http().post('/api/v1/servicios')).send({
        id,
        nombre: 'De B',
        precio: 2,
      });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CONFLICTO');
      expect(JSON.stringify(res.body)).not.toContain('De A');
    });
  });

  describe('GET /servicios', () => {
    it('solo trae los activos por defecto', async () => {
      const creado = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'Se desactivará',
        precio: 3,
      });
      await comoA(http().patch(`/api/v1/servicios/${creado.body.id}`)).send({ activo: false });

      const res = await comoA(http().get('/api/v1/servicios'));

      expect(res.status).toBe(200);
      expect(res.body.datos.every((s: { activo: boolean }) => s.activo)).toBe(true);
      expect(res.body.datos.map((s: { id: string }) => s.id)).not.toContain(creado.body.id);
    });

    it('incluir_inactivos=true los devuelve también', async () => {
      const res = await comoA(http().get('/api/v1/servicios').query({ incluir_inactivos: true }));

      expect(res.body.datos.some((s: { activo: boolean }) => !s.activo)).toBe(true);
    });

    it('incluir_inactivos con un valor que no es booleano → 400', async () => {
      const res = await comoA(http().get('/api/v1/servicios').query({ incluir_inactivos: 'sí' }));

      expect(res.status).toBe(400);
    });

    it('envoltura paginada y orden por nombre', async () => {
      const res = await comoA(http().get('/api/v1/servicios'));

      expect(res.body).toEqual({
        datos: expect.any(Array),
        pagina: 1,
        por_pagina: 20,
        total: expect.any(Number),
      });
      const nombres = res.body.datos.map((s: { nombre: string }) => s.nombre);
      expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b)));
    });

    it('cada negocio solo ve su catálogo', async () => {
      const deB = await comoB(http().get('/api/v1/servicios').query({ incluir_inactivos: true }));

      expect(deB.body.datos.some((s: { nombre: string }) => s.nombre === 'Basta de jean')).toBe(
        false,
      );
    });
  });

  describe('PATCH /servicios/{id}', () => {
    let id: string;

    beforeEach(async () => {
      const res = await comoA(http().post('/api/v1/servicios')).send({
        nombre: 'Para editar',
        precio: 20,
      });
      id = res.body.id;
    });

    it('cambia el precio', async () => {
      const res = await comoA(http().patch(`/api/v1/servicios/${id}`)).send({ precio: 22 });

      expect(res.status).toBe(200);
      expect(res.body.precio).toBe(22);
    });

    it('desactiva y reactiva', async () => {
      const apagado = await comoA(http().patch(`/api/v1/servicios/${id}`)).send({ activo: false });
      expect(apagado.body.activo).toBe(false);

      const encendido = await comoA(http().patch(`/api/v1/servicios/${id}`)).send({ activo: true });
      expect(encendido.body.activo).toBe(true);
    });

    it('ignora el nombre: no es editable', async () => {
      const res = await comoA(http().patch(`/api/v1/servicios/${id}`)).send({
        nombre: 'Renombrado',
      });

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('Para editar');
    });

    it('un PATCH sin cambios reales no mueve actualizado_en', async () => {
      const antes = await comoA(http().patch(`/api/v1/servicios/${id}`)).send({ precio: 25 });
      const igual = await comoA(http().patch(`/api/v1/servicios/${id}`)).send({ precio: 25 });

      expect(igual.body.actualizado_en).toBe(antes.body.actualizado_en);
    });

    it('no existe DELETE (Doc 2, invariante 14)', async () => {
      const res = await comoA(http().delete(`/api/v1/servicios/${id}`));

      expect(res.status).toBe(404);
    });

    it('un servicio de otro negocio → 404 y no se modifica', async () => {
      const res = await comoB(http().patch(`/api/v1/servicios/${id}`)).send({ precio: 1 });

      expect(res.status).toBe(404);
      const sigueIgual = await comoA(http().get('/api/v1/servicios').query({ por_pagina: 100 }));
      const servicio = sigueIgual.body.datos.find((s: { id: string }) => s.id === id);
      expect(servicio.precio).toBe(20);
    });

    it('precio negativo → 422', async () => {
      const res = await comoA(http().patch(`/api/v1/servicios/${id}`)).send({ precio: -1 });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('SERVICIO_PRECIO_INVALIDO');
    });
  });
});
