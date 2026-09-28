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

// Doc 5 Bloque 2 (agregado Cliente) contra el Postgres local, con RLS real.
// Dos negocios distintos (A y B) para comprobar el 404 entre tenants — que es
// la garantía que ningún test unitario puede dar, porque depende del filtro de
// PrismaNegocio y de las políticas de Postgres actuando a la vez.
describe('Clientes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `clientes-A-${marca}`;
  const uidB = `clientes-B-${marca}`;
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

  describe('autenticación', () => {
    it('sin token → 401 TOKEN_AUSENTE (el AuthGuard global protege el módulo)', async () => {
      const res = await http().get('/api/v1/clientes');

      expect(res.status).toBe(401);
      expect(res.body.error.codigo).toBe('TOKEN_AUSENTE');
    });
  });

  describe('POST /clientes', () => {
    it('crea con 201 y devuelve el recurso en snake_case', async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({
        nombre: '  Ana María  ',
        telefono: '+51987654321',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        nombre: 'Ana María',
        telefono: '+51987654321',
        creado_en: expect.any(String),
        actualizado_en: expect.any(String),
      });
    });

    it('el teléfono es opcional', async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({ nombre: 'Sin teléfono' });

      expect(res.status).toBe(201);
      expect(res.body.telefono).toBeNull();
    });

    it('nombre vacío → 422 CLIENTE_NOMBRE_VACIO (no 400: es regla de negocio)', async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({ nombre: '   ' });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('CLIENTE_NOMBRE_VACIO');
    });

    it('teléfono fuera de E.164 → 422 TELEFONO_INVALIDO', async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({
        nombre: 'Ana',
        telefono: '987654321',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('TELEFONO_INVALIDO');
      expect(res.body.error.detalles).toEqual({ telefono_recibido: '987654321' });
    });

    it('nombre ausente o de otro tipo → 400 SOLICITUD_INVALIDA (formato, antes del dominio)', async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({ telefono: '+51987654321' });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    });

    it('id que no es UUID → 400', async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({ id: 'abc', nombre: 'Ana' });

      expect(res.status).toBe(400);
    });

    describe('idempotencia con el UUID del dispositivo (Doc 3 + Outbox del Doc 5)', () => {
      const id = randomUUID();

      it('respeta el id enviado', async () => {
        const res = await comoA(http().post('/api/v1/clientes')).send({ id, nombre: 'Carlos' });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe(id);
      });

      it('el reintento devuelve 200 con el existente, sin duplicar ni pisar', async () => {
        const res = await comoA(http().post('/api/v1/clientes')).send({
          id,
          nombre: 'Nombre distinto',
        });

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(id);
        expect(res.body.nombre).toBe('Carlos');
      });

      it('dos reintentos simultáneos no crean dos filas', async () => {
        const idParalelo = randomUUID();

        const respuestas = await Promise.all([
          comoA(http().post('/api/v1/clientes')).send({ id: idParalelo, nombre: 'Paralelo' }),
          comoA(http().post('/api/v1/clientes')).send({ id: idParalelo, nombre: 'Paralelo' }),
        ]);

        expect(respuestas.map((r) => r.status).sort()).toEqual([200, 201]);
        expect(respuestas.every((r) => r.body.id === idParalelo)).toBe(true);
      });

      it('reusar el id de otro negocio → 409 neutro, sin revelar el cliente ajeno', async () => {
        const res = await comoB(http().post('/api/v1/clientes')).send({ id, nombre: 'De B' });

        // La llave primaria es global; los negocios no. B no puede crear esa
        // fila, pero tampoco debe enterarse de que existe en A.
        expect(res.status).toBe(409);
        expect(res.body.error.codigo).toBe('CONFLICTO');
        expect(JSON.stringify(res.body)).not.toContain('Carlos');
      });

      it('tras el 409, B sigue sin ver el cliente de A', async () => {
        const res = await comoB(http().get(`/api/v1/clientes/${id}`));

        expect(res.status).toBe(404);
      });
    });
  });

  describe('GET /clientes', () => {
    it('devuelve la envoltura paginada del Doc 5 Bloque 4, ordenada por nombre', async () => {
      const res = await comoA(http().get('/api/v1/clientes'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        datos: expect.any(Array),
        pagina: 1,
        por_pagina: 20,
        total: expect.any(Number),
      });
      const nombres = res.body.datos.map((c: { nombre: string }) => c.nombre);
      expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b)));
    });

    it('cada negocio solo ve los suyos', async () => {
      const deA = await comoA(http().get('/api/v1/clientes'));
      const deB = await comoB(http().get('/api/v1/clientes'));

      expect(deA.body.datos.some((c: { nombre: string }) => c.nombre === 'Carlos')).toBe(true);
      expect(deB.body.datos.some((c: { nombre: string }) => c.nombre === 'Carlos')).toBe(false);
    });

    it('busca por nombre parcial, sin distinguir mayúsculas (Caso 8)', async () => {
      const res = await comoA(http().get('/api/v1/clientes').query({ q: 'ana mar' }));

      expect(res.status).toBe(200);
      expect(res.body.datos).toHaveLength(1);
      expect(res.body.datos[0].nombre).toBe('Ana María');
    });

    it('busca por teléfono parcial', async () => {
      const res = await comoA(http().get('/api/v1/clientes').query({ q: '98765' }));

      expect(res.body.datos.map((c: { nombre: string }) => c.nombre)).toContain('Ana María');
    });

    it('una búsqueda sin coincidencias devuelve lista vacía y total 0', async () => {
      const res = await comoA(http().get('/api/v1/clientes').query({ q: 'zzzzzz-inexistente' }));

      expect(res.body).toMatchObject({ datos: [], total: 0 });
    });

    it('pagina: por_pagina=1 devuelve una fila pero el total completo', async () => {
      const res = await comoA(http().get('/api/v1/clientes').query({ por_pagina: 1 }));

      expect(res.body.datos).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(1);
      expect(res.body.por_pagina).toBe(1);
    });

    it('rechaza por_pagina fuera de rango → 400', async () => {
      await expect(
        comoA(http().get('/api/v1/clientes').query({ por_pagina: 1000 })).then((r) => r.status),
      ).resolves.toBe(400);
      await expect(
        comoA(http().get('/api/v1/clientes').query({ pagina: 0 })).then((r) => r.status),
      ).resolves.toBe(400);
    });
  });

  describe('GET /clientes/{id}', () => {
    let idDeA: string;

    beforeAll(async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({ nombre: 'Ficha' });
      idDeA = res.body.id;
    });

    it('devuelve la ficha', async () => {
      const res = await comoA(http().get(`/api/v1/clientes/${idDeA}`));

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('Ficha');
    });

    it('un cliente de otro negocio → 404, nunca 403 (Doc 5 Bloque 3)', async () => {
      const res = await comoB(http().get(`/api/v1/clientes/${idDeA}`));

      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
    });

    it('un id inexistente → 404', async () => {
      const res = await comoA(http().get(`/api/v1/clientes/${randomUUID()}`));

      expect(res.status).toBe(404);
    });

    it('un id que no es UUID → 400', async () => {
      const res = await comoA(http().get('/api/v1/clientes/no-es-uuid'));

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /clientes/{id}', () => {
    let id: string;

    beforeEach(async () => {
      const res = await comoA(http().post('/api/v1/clientes')).send({
        nombre: 'Para editar',
        telefono: '+51911111111',
      });
      id = res.body.id;
    });

    it('edita solo el campo enviado', async () => {
      const res = await comoA(http().patch(`/api/v1/clientes/${id}`)).send({ nombre: 'Editado' });

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('Editado');
      expect(res.body.telefono).toBe('+51911111111');
    });

    it('telefono: null borra el teléfono', async () => {
      const res = await comoA(http().patch(`/api/v1/clientes/${id}`)).send({ telefono: null });

      expect(res.status).toBe(200);
      expect(res.body.telefono).toBeNull();
    });

    it('un PATCH sin cambios reales no mueve actualizado_en (delta sync)', async () => {
      const antes = await comoA(http().get(`/api/v1/clientes/${id}`));
      const res = await comoA(http().patch(`/api/v1/clientes/${id}`)).send({
        nombre: 'Para editar',
      });

      expect(res.status).toBe(200);
      expect(res.body.actualizado_en).toBe(antes.body.actualizado_en);
    });

    it('editar un cliente de otro negocio → 404 y no lo modifica', async () => {
      const res = await comoB(http().patch(`/api/v1/clientes/${id}`)).send({ nombre: 'Secuestro' });

      expect(res.status).toBe(404);
      const sigueIgual = await comoA(http().get(`/api/v1/clientes/${id}`));
      expect(sigueIgual.body.nombre).toBe('Para editar');
    });

    it('nombre vacío → 422', async () => {
      const res = await comoA(http().patch(`/api/v1/clientes/${id}`)).send({ nombre: '  ' });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('CLIENTE_NOMBRE_VACIO');
    });

    it('ignora campos desconocidos (whitelist del ValidationPipe)', async () => {
      const res = await comoA(http().patch(`/api/v1/clientes/${id}`)).send({
        nombre: 'Ok',
        negocio_id: randomUUID(),
        creado_en: '1999-01-01T00:00:00Z',
      });

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('Ok');
      expect(res.body.creado_en).not.toContain('1999');
    });
  });
});
