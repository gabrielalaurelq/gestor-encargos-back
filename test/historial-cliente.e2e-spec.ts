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

// Doc 5 Bloque 2: `GET /clientes/{id}/encargos` (PRD módulo 1) y el resumen de
// Historial dentro de `GET /clientes/{id}` (PRD módulo 18). Contra el Postgres
// local con RLS real: la suma de pagos cruza tres tablas, y es justo ahí donde
// un filtro de negocio olvidado mezclaría el dinero de otro tenant.
describe('Historial de cliente (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `historial-A-${marca}`;
  const uidB = `historial-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let origenEfectivo: number;

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

    const origen = await prisma.origenPago.findFirst({ orderBy: { id: 'asc' } });
    origenEfectivo = origen!.id;
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

  const como = (token: string) => (peticion: request.Test) =>
    peticion.set('Authorization', `Bearer ${token}`);
  const comoA = (peticion: request.Test) => como(tokenA)(peticion);
  const comoB = (peticion: request.Test) => como(tokenB)(peticion);

  async function nuevoCliente(token: string, nombre = 'Cliente'): Promise<string> {
    const res = await como(token)(http().post('/api/v1/clientes')).send({ nombre });
    return res.body.id;
  }

  async function nuevoEncargo(token: string, clienteId: string, descripcion: string) {
    const res = await como(token)(http().post('/api/v1/encargos')).send({
      cliente_id: clienteId,
      descripcion,
      fecha_entrega_acordada: '2026-11-15',
    });
    await como(token)(http().post(`/api/v1/encargos/${res.body.id}/trabajos`)).send({
      descripcion: 'Trabajo',
      precio: 500,
    });
    return res.body.id as string;
  }

  async function pagar(token: string, encargoId: string, monto: number): Promise<string> {
    const res = await como(token)(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
      monto,
      origen_id: origenEfectivo,
      tipo: 'PAGO',
    });
    return res.body.pago.id;
  }

  describe('GET /clientes/{id} — resumen de Historial (PRD 18)', () => {
    it('cliente nuevo → "0 encargos" sin error', async () => {
      const clienteId = await nuevoCliente(tokenA);

      const res = await comoA(http().get(`/api/v1/clientes/${clienteId}`));

      expect(res.status).toBe(200);
      expect(res.body.historial).toEqual({
        total_encargos: 0,
        total_pagado: 0,
        ultimo_encargo_en: null,
      });
    });

    it('cuenta todos los estados y suma solo pagos vigentes, incluidos los de cancelados', async () => {
      const clienteId = await nuevoCliente(tokenA);
      const activo = await nuevoEncargo(tokenA, clienteId, 'Activo');
      const cancelado = await nuevoEncargo(tokenA, clienteId, 'Cancelado');

      await pagar(tokenA, activo, 100.25);
      const borrado = await pagar(tokenA, activo, 70);
      await comoA(http().delete(`/api/v1/encargos/${activo}/pagos/${borrado}`)).expect(200);
      await pagar(tokenA, cancelado, 50.5);
      await comoA(http().patch(`/api/v1/encargos/${cancelado}/estado`))
        .send({ estado: 'CANCELADO' })
        .expect(200);

      const res = await comoA(http().get(`/api/v1/clientes/${clienteId}`));

      expect(res.body.historial.total_encargos).toBe(2);
      // 100.25 + 50.5; el pago de 70 eliminado no cuenta, el del cancelado sí.
      expect(res.body.historial.total_pagado).toBe(150.75);
      // Por la API y no con `prisma` directo: fuera de `enNegocio()` RLS oculta la fila.
      const ultimo = await comoA(http().get(`/api/v1/encargos/${cancelado}`));
      expect(res.body.historial.ultimo_encargo_en).toBe(ultimo.body.creado_en);
    });

    it('no mezcla encargos de otros clientes del mismo negocio', async () => {
      const uno = await nuevoCliente(tokenA);
      const otro = await nuevoCliente(tokenA);
      await pagar(tokenA, await nuevoEncargo(tokenA, otro, 'Ajeno'), 999);

      const res = await comoA(http().get(`/api/v1/clientes/${uno}`));

      expect(res.body.historial).toMatchObject({ total_encargos: 0, total_pagado: 0 });
    });

    it('el listado no trae historial (solo la ficha)', async () => {
      await nuevoCliente(tokenA);

      const res = await comoA(http().get('/api/v1/clientes'));

      expect(res.body.datos[0]).not.toHaveProperty('historial');
    });
  });

  describe('GET /clientes/{id}/encargos — historial completo (PRD 1)', () => {
    let clienteId: string;
    let creados: string[];

    beforeAll(async () => {
      clienteId = await nuevoCliente(tokenA, 'Con historial');
      creados = [];
      for (const descripcion of ['Primero', 'Segundo', 'Tercero']) {
        creados.push(await nuevoEncargo(tokenA, clienteId, descripcion));
      }
    });

    it('devuelve todos, el más reciente primero, con el formato paginado del Doc 5', async () => {
      const res = await comoA(http().get(`/api/v1/clientes/${clienteId}/encargos`));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ pagina: 1, por_pagina: 20, total: 3 });
      expect(res.body.datos.map((e: { id: string }) => e.id)).toEqual([...creados].reverse());
    });

    it('pagina sin repetir ni saltarse filas', async () => {
      const primera = await comoA(
        http().get(`/api/v1/clientes/${clienteId}/encargos?pagina=1&por_pagina=2`),
      );
      const segunda = await comoA(
        http().get(`/api/v1/clientes/${clienteId}/encargos?pagina=2&por_pagina=2`),
      );

      const ids = [...primera.body.datos, ...segunda.body.datos].map((e: { id: string }) => e.id);
      expect(ids).toEqual([...creados].reverse());
      expect(segunda.body.total).toBe(3);
    });

    it('incluye los cancelados', async () => {
      await comoA(http().patch(`/api/v1/encargos/${creados[0]}/estado`))
        .send({ estado: 'CANCELADO' })
        .expect(200);

      const res = await comoA(http().get(`/api/v1/clientes/${clienteId}/encargos`));

      expect(res.body.total).toBe(3);
    });

    it('cliente sin encargos → 200 con lista vacía, no 404', async () => {
      const vacio = await nuevoCliente(tokenA);

      const res = await comoA(http().get(`/api/v1/clientes/${vacio}/encargos`));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ datos: [], total: 0 });
    });

    it('cliente inexistente → 404 NO_ENCONTRADO', async () => {
      const res = await comoA(http().get(`/api/v1/clientes/${randomUUID()}/encargos`));

      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
    });

    it('cliente de otro negocio → 404, nunca 403 (Doc 5 Bloque 3)', async () => {
      const res = await comoB(http().get(`/api/v1/clientes/${clienteId}/encargos`));

      expect(res.status).toBe(404);
    });

    it('id mal formado → 400', async () => {
      const res = await comoA(http().get('/api/v1/clientes/no-es-uuid/encargos'));

      expect(res.status).toBe(400);
    });
  });
});
