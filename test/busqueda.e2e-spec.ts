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

// Doc 5 Bloque 4: `GET /buscar?q=` (PRD módulo 16), contra el Postgres local.
// Cada negocio de prueba nace vacío, así que los conteos exactos son fiables.
describe('Búsqueda global (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `busqueda-A-${marca}`;
  const uidB = `busqueda-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let ana: string;
  let vestido: string;
  let cajon: string;
  let cancelado: string;

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

    ana = (
      await comoA(http().post('/api/v1/clientes')).send({
        nombre: 'Ana García',
        telefono: '+51987654321',
      })
    ).body.id;
    const pedro = (await comoA(http().post('/api/v1/clientes')).send({ nombre: 'Pedro Vestidor' }))
      .body.id;

    vestido = await encargo(ana, 'Vestido rojo de fiesta');
    cajon = await encargo(pedro, 'Ajuste de pantalón', 'Cajón 3, bolsa azul');
    cancelado = await encargo(ana, 'Vestido de novia');
    await comoA(http().patch(`/api/v1/encargos/${cancelado}/estado`))
      .send({ estado: 'CANCELADO' })
      .expect(200);

    // Ruido en otro negocio con los mismos textos: no debe aparecer nunca.
    const ajeno = (await comoB(http().post('/api/v1/clientes')).send({ nombre: 'Ana Ajena' })).body
      .id;
    await comoB(http().post('/api/v1/encargos')).send({
      cliente_id: ajeno,
      descripcion: 'Vestido ajeno',
      fecha_entrega_acordada: '2026-11-15',
    });
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

  async function encargo(clienteId: string, descripcion: string, ubicacion?: string) {
    const res = await comoA(http().post('/api/v1/encargos')).send({
      cliente_id: clienteId,
      descripcion,
      fecha_entrega_acordada: '2026-11-15',
      ...(ubicacion ? { ubicacion_fisica: ubicacion } : {}),
    });
    return res.body.id as string;
  }

  const buscar = (q: string) => comoA(http().get('/api/v1/buscar').query({ q }));
  const ids = (lista: { id: string }[]) => lista.map((x) => x.id);

  it('un mismo texto encuentra clientes y encargos, cada uno en su grupo (PRD 16)', async () => {
    const res = await buscar('vestid');

    expect(res.status).toBe(200);
    // "Pedro Vestidor" es cliente; los dos vestidos son encargos.
    expect(res.body.clientes.map((c: { nombre: string }) => c.nombre)).toEqual(['Pedro Vestidor']);
    // Más recientes primero, e incluye el cancelado (Caso 8, no filtra por estado).
    expect(ids(res.body.encargos)).toEqual([cancelado, vestido]);
  });

  it('por ubicación física: "cajón 3" encuentra el encargo guardado ahí', async () => {
    const res = await buscar('cajón 3');

    expect(ids(res.body.encargos)).toEqual([cajon]);
    expect(res.body.clientes).toEqual([]);
  });

  it('por teléfono parcial', async () => {
    const res = await buscar('987654');

    expect(ids(res.body.clientes)).toEqual([ana]);
  });

  it('no distingue mayúsculas y acepta una sola letra', async () => {
    expect(ids((await buscar('ANA')).body.clientes)).toEqual([ana]);
    expect((await buscar('a')).status).toBe(200);
  });

  it('sin coincidencias → 200 con los dos grupos vacíos, no un error', async () => {
    const res = await buscar('zzzz-nada');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clientes: [], encargos: [] });
  });

  // Lo encontró este mismo e2e: Prisma no escapa los comodines, y `%`
  // devolvía todo el negocio (también en `GET /clientes?q=`, desde Sprint 1).
  it.each([['%'], ['_'], ['Ana_García']])(
    'los comodines de LIKE se buscan literalmente: %j no encuentra nada',
    async (q) => {
      expect((await buscar(q)).body).toEqual({ clientes: [], encargos: [] });
    },
  );

  it('GET /clientes?q=% tampoco devuelve todo', async () => {
    const res = await comoA(http().get('/api/v1/clientes').query({ q: '%' }));

    expect(res.body.total).toBe(0);
  });

  it('nunca devuelve datos de otro negocio', async () => {
    const res = await buscar('ajen');

    expect(res.body).toEqual({ clientes: [], encargos: [] });
  });

  it('las respuestas tienen la misma forma que los listados', async () => {
    const res = await buscar('cajón');

    expect(res.body.encargos[0]).toMatchObject({
      id: cajon,
      descripcion: 'Ajuste de pantalón',
      ubicacion_fisica: 'Cajón 3, bolsa azul',
      estado: 'INGRESADO',
    });
  });

  it.each([[''], ['   ']])('q=%j → 400', async (q) => {
    expect((await buscar(q)).status).toBe(400);
  });

  it('sin q → 400', async () => {
    expect((await comoA(http().get('/api/v1/buscar'))).status).toBe(400);
  });

  it('sin token → 401', async () => {
    expect((await http().get('/api/v1/buscar?q=ana')).status).toBe(401);
  });
});
