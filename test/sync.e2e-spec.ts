import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configurarAplicacion } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { Ambiente } from '../src/config/env.validation';
import { VerificadorIdentidad } from '../src/modules/auth/application/ports/verificador-identidad';
import { MARGEN_SOLAPE_MS } from '../src/modules/sync/domain/siguiente-since';
import { ErrorAutenticacion } from '../src/shared/application/error-autenticacion';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

// Doc 5 Bloque 1 — `GET /sync`, el pull del motor offline-first. Contra el
// Postgres local con RLS real y dos negocios, porque un fallo de aislamiento
// acá filtraría la base entera de otro negocio en una sola respuesta.
describe('Sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `sync-A-${marca}`;
  const uidB = `sync-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let clienteA: string;
  let origenPago: number;

  const COLECCIONES = [
    'clientes',
    'servicios',
    'encargos',
    'objetos_recibidos',
    'trabajos',
    'materiales',
    'pagos',
    'notas',
    'fotos',
  ];

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
    origenPago = (await prisma.origenPago.findFirst({ orderBy: { id: 'asc' } }))!.id;

    clienteA = (
      await comoA(http().post('/api/v1/clientes')).send({
        nombre: 'Ana de A',
        telefono: '+51987654321',
      })
    ).body.id;
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

  const sync = (token: string, since?: string) => {
    const peticion = http().get('/api/v1/sync').set('Authorization', `Bearer ${token}`);
    return since ? peticion.query({ since }) : peticion;
  };

  it('sin token → 401', async () => {
    expect((await http().get('/api/v1/sync')).status).toBe(401);
  });

  describe('primera sincronización (sin since)', () => {
    it('devuelve el estado completo con las 9 colecciones siempre presentes', async () => {
      const res = await sync(tokenA);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        servidor_timestamp: expect.any(String),
        has_more: false,
      });
      expect(Object.keys(res.body.cambios).sort()).toEqual([...COLECCIONES].sort());
      expect(res.body.cambios.clientes).toHaveLength(1);
      // materiales y fotos no tienen módulo todavía: vienen vacías, pero la
      // clave existe para que Sprint 7 no obligue a tocar el cliente.
      expect(res.body.cambios.materiales).toEqual([]);
      expect(res.body.cambios.fotos).toEqual([]);
    });

    it('el cliente trae sus campos en snake_case', async () => {
      const res = await sync(tokenA);

      expect(res.body.cambios.clientes[0]).toEqual({
        id: clienteA,
        nombre: 'Ana de A',
        telefono: '+51987654321',
        creado_en: expect.any(String),
        actualizado_en: expect.any(String),
      });
    });

    it('un negocio nuevo recibe todo vacío, no la base de otro', async () => {
      const res = await sync(tokenB);

      expect(res.status).toBe(200);
      for (const coleccion of COLECCIONES) {
        expect(res.body.cambios[coleccion]).toEqual([]);
      }
    });
  });

  describe('el margen de solape', () => {
    it('servidor_timestamp queda por detrás del momento de la petición', async () => {
      const antes = Date.now();
      const res = await sync(tokenA);

      const devuelto = new Date(res.body.servidor_timestamp).getTime();
      expect(devuelto).toBeLessThanOrEqual(antes - MARGEN_SOLAPE_MS + 1000);
      expect(devuelto).toBeGreaterThan(antes - MARGEN_SOLAPE_MS - 5000);
    });

    it('una fila escrita justo antes vuelve a viajar: no se pierde', async () => {
      const primera = await sync(tokenA);

      // Se crea algo inmediatamente después de sincronizar: su actualizado_en
      // cae dentro de la ventana de solape.
      const nuevo = await comoA(http().post('/api/v1/clientes')).send({ nombre: 'Recién creado' });

      const segunda = await sync(tokenA, primera.body.servidor_timestamp);

      expect(segunda.body.cambios.clientes.map((c: { id: string }) => c.id)).toContain(
        nuevo.body.id,
      );
    });

    it('since inclusivo: una fila con exactamente esa marca vuelve a viajar', async () => {
      const creado = await comoA(http().post('/api/v1/clientes')).send({ nombre: 'En el borde' });
      const suMarca = creado.body.actualizado_en;

      const res = await sync(tokenA, suMarca);

      expect(res.body.cambios.clientes.map((c: { id: string }) => c.id)).toContain(creado.body.id);
    });
  });

  describe('cambios incrementales', () => {
    it('un since en el futuro no devuelve nada', async () => {
      const futuro = new Date(Date.now() + 60_000).toISOString();

      const res = await sync(tokenA, futuro);

      for (const coleccion of COLECCIONES) {
        expect(res.body.cambios[coleccion]).toEqual([]);
      }
    });

    it('una edición viaja con el valor nuevo', async () => {
      const antesDeEditar = new Date(Date.now() - 1000).toISOString();
      await comoA(http().patch(`/api/v1/clientes/${clienteA}`)).send({ nombre: 'Ana editada' });

      const res = await sync(tokenA, antesDeEditar);

      const cliente = res.body.cambios.clientes.find((c: { id: string }) => c.id === clienteA);
      expect(cliente.nombre).toBe('Ana editada');
    });

    it('el agregado completo viaja con sus llaves foráneas', async () => {
      const desde = new Date(Date.now() - 1000).toISOString();

      const encargo = await comoA(http().post('/api/v1/encargos')).send({
        cliente_id: clienteA,
        descripcion: 'Encargo sincronizable',
        fecha_entrega_acordada: '2026-12-01',
        numero: 7,
      });
      const encargoId = encargo.body.id;

      const objeto = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'Pantalón',
      });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Basta',
        precio: 20,
        objeto_recibido_id: objeto.body.objeto.id,
      });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 5,
        origen_id: origenPago,
        tipo: 'ADELANTO',
      });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/notas`)).send({ texto: 'Una nota' });

      const res = await sync(tokenA, desde);

      const sincronizado = res.body.cambios.encargos.find(
        (e: { id: string }) => e.id === encargoId,
      );
      expect(sincronizado).toMatchObject({
        cliente_id: clienteA,
        numero: 7,
        estado: 'INGRESADO',
        precio_total: 20,
        saldo_pendiente: 15,
        fecha_entrega_acordada: '2026-12-01',
        fecha_entrega_prometida: '2026-12-01',
        fecha_listo: null,
      });

      // Los hijos llegan planos: necesitan su encargo_id para reconstruirse.
      expect(res.body.cambios.trabajos[0]).toMatchObject({
        encargo_id: encargoId,
        objeto_recibido_id: objeto.body.objeto.id,
        precio: 20,
        eliminado_en: null,
      });
      expect(res.body.cambios.pagos[0]).toMatchObject({
        encargo_id: encargoId,
        monto: 5,
        origen_id: origenPago,
        tipo: 'ADELANTO',
      });
      expect(res.body.cambios.pagos[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.cambios.notas[0]).toMatchObject({ encargo_id: encargoId, texto: 'Una nota' });
    });
  });

  describe('tombstones', () => {
    it('un hijo borrado viaja con eliminado_en, no desaparece', async () => {
      const encargo = await comoA(http().post('/api/v1/encargos')).send({
        cliente_id: clienteA,
        descripcion: 'Con borrado',
        fecha_entrega_acordada: '2026-12-02',
      });
      const trabajo = await comoA(http().post(`/api/v1/encargos/${encargo.body.id}/trabajos`)).send(
        { descripcion: 'Se borrará', precio: 10 },
      );

      const desde = new Date(Date.now() - 1000).toISOString();
      await comoA(
        http().delete(`/api/v1/encargos/${encargo.body.id}/trabajos/${trabajo.body.trabajo.id}`),
      );

      const res = await sync(tokenA, desde);

      const borrado = res.body.cambios.trabajos.find(
        (t: { id: string }) => t.id === trabajo.body.trabajo.id,
      );
      expect(borrado).toBeDefined();
      expect(borrado.eliminado_en).not.toBeNull();
    });

    it('el encargo viaja con el precio_total ya recalculado tras el borrado', async () => {
      const encargo = await comoA(http().post('/api/v1/encargos')).send({
        cliente_id: clienteA,
        descripcion: 'Recalculado',
        fecha_entrega_acordada: '2026-12-03',
      });
      const trabajo = await comoA(http().post(`/api/v1/encargos/${encargo.body.id}/trabajos`)).send(
        { descripcion: 'Único', precio: 40 },
      );

      const desde = new Date(Date.now() - 1000).toISOString();
      await comoA(
        http().delete(`/api/v1/encargos/${encargo.body.id}/trabajos/${trabajo.body.trabajo.id}`),
      );

      const res = await sync(tokenA, desde);

      const sincronizado = res.body.cambios.encargos.find(
        (e: { id: string }) => e.id === encargo.body.id,
      );
      expect(sincronizado.precio_total).toBe(0);
    });
  });

  describe('aislamiento entre negocios', () => {
    it('B no ve nada de A ni en la sincronización completa', async () => {
      await comoB(http().post('/api/v1/clientes')).send({ nombre: 'Solo de B' });

      const res = await sync(tokenB);

      expect(res.body.cambios.clientes.map((c: { nombre: string }) => c.nombre)).toEqual([
        'Solo de B',
      ]);
      expect(res.body.cambios.encargos).toEqual([]);
      expect(res.body.cambios.trabajos).toEqual([]);
      expect(res.body.cambios.pagos).toEqual([]);
    });
  });

  describe('validación de since', () => {
    it('un since que no es ISO 8601 → 400', async () => {
      const res = await sync(tokenA, 'ayer');

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    });

    it('acepta una fecha sin hora como ISO 8601 válido', async () => {
      expect((await sync(tokenA, '2026-01-01')).status).toBe(200);
    });
  });
});
