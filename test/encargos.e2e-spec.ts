import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configurarAplicacion } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { Ambiente } from '../src/config/env.validation';
import { VerificadorIdentidad } from '../src/modules/auth/application/ports/verificador-identidad';
import { TAMANO_BLOQUE_NUMEROS } from '../src/modules/encargos/application/use-cases/reservar-bloque-numeros.use-case';
import { ErrorAutenticacion } from '../src/shared/application/error-autenticacion';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

// Doc 5 Bloque 2 — agregado Encargo, contra el Postgres local con RLS real.
// Dos negocios para el aislamiento, y la numeración Hi/Lo contra el contador
// de verdad (es donde se vería una carrera).
describe('Encargos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `encargos-A-${marca}`;
  const uidB = `encargos-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let clienteA: string;
  let clienteB: string;

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
    clienteA = await crearCliente(tokenA, 'Cliente de A');
    clienteB = await crearCliente(tokenB, 'Cliente de B');
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

  async function crearCliente(token: string, nombre: string): Promise<string> {
    const res = await http()
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre });
    return res.body.id;
  }

  const comoA = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenA}`);
  const comoB = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenB}`);

  const nuevoEncargo = (extra: Record<string, unknown> = {}) => ({
    cliente_id: clienteA,
    descripcion: 'Arreglo de pantalón',
    fecha_entrega_acordada: '2026-10-15',
    ...extra,
  });

  const crear = (extra: Record<string, unknown> = {}) =>
    comoA(http().post('/api/v1/encargos')).send(nuevoEncargo(extra));

  it('sin token → 401', async () => {
    expect((await http().get('/api/v1/encargos')).status).toBe(401);
  });

  describe('POST /encargos', () => {
    it('crea INGRESADO, con la fecha prometida igual a la acordada', async () => {
      const res = await crear({ numero: 1, ubicacion_fisica: '  Cajón azul  ' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        cliente_id: clienteA,
        numero: 1,
        descripcion: 'Arreglo de pantalón',
        estado: 'INGRESADO',
        precio_total: 0,
        descuento: 0,
        saldo_pendiente: 0,
        fecha_entrega_prometida: '2026-10-15',
        fecha_entrega_acordada: '2026-10-15',
        fecha_listo: null,
        fecha_entrega_real: null,
        ubicacion_fisica: 'Cajón azul',
        notas_generales: null,
      });
    });

    it('sin número queda en null ("Pendiente")', async () => {
      expect((await crear()).body.numero).toBeNull();
    });

    it('sin fecha de entrega → 422 ENCARGO_SIN_FECHA', async () => {
      const res = await comoA(http().post('/api/v1/encargos')).send({
        cliente_id: clienteA,
        descripcion: 'X',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('ENCARGO_SIN_FECHA');
    });

    it('fecha mal formada → 422 FECHA_INVALIDA', async () => {
      const res = await crear({ fecha_entrega_acordada: '15/10/2026' });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('FECHA_INVALIDA');
    });

    it('descripción vacía → 422', async () => {
      const res = await crear({ descripcion: '  ' });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('ENCARGO_DESCRIPCION_VACIA');
    });

    it('descuento sin trabajos → 422 DESCUENTO_INVALIDO con los montos en juego', async () => {
      const res = await crear({ descuento: 10 });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        codigo: 'DESCUENTO_INVALIDO',
        detalles: { descuento_solicitado: 10, suma_trabajos: 0 },
      });
    });

    it('un cliente de otro negocio → 422 CLIENTE_NO_ENCONTRADO, no 500 por la FK', async () => {
      const res = await comoA(http().post('/api/v1/encargos')).send(
        nuevoEncargo({ cliente_id: clienteB }),
      );

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('CLIENTE_NO_ENCONTRADO');
    });

    it('un cliente inexistente → 422', async () => {
      const res = await comoA(http().post('/api/v1/encargos')).send(
        nuevoEncargo({ cliente_id: randomUUID() }),
      );

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('CLIENTE_NO_ENCONTRADO');
    });

    it('un número repetido en el mismo negocio → 422 ENCARGO_NUMERO_EN_USO', async () => {
      await crear({ numero: 900 });
      const res = await crear({ numero: 900 });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        codigo: 'ENCARGO_NUMERO_EN_USO',
        detalles: { numero: 900 },
      });
    });

    it('el mismo número en otro negocio sí se permite (invariante 21)', async () => {
      const res = await comoB(http().post('/api/v1/encargos')).send({
        cliente_id: clienteB,
        descripcion: 'De B',
        fecha_entrega_acordada: '2026-10-15',
        numero: 900,
      });

      expect(res.status).toBe(201);
      expect(res.body.numero).toBe(900);
    });

    it('reintento con el mismo id → 200 con el existente', async () => {
      const id = randomUUID();
      const uno = await crear({ id, descripcion: 'Original' });
      const reintento = await crear({ id, descripcion: 'Otra cosa' });

      expect(uno.status).toBe(201);
      expect(reintento.status).toBe(200);
      expect(reintento.body.descripcion).toBe('Original');
    });
  });

  describe('POST /encargos/reservar-bloque-numeros', () => {
    it('el primer bloque arranca en 1', async () => {
      const res = await comoB(http().post('/api/v1/encargos/reservar-bloque-numeros'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ desde: 1, hasta: TAMANO_BLOQUE_NUMEROS });
    });

    it('el siguiente bloque continúa donde terminó el anterior', async () => {
      const res = await comoB(http().post('/api/v1/encargos/reservar-bloque-numeros'));

      expect(res.body).toEqual({
        desde: TAMANO_BLOQUE_NUMEROS + 1,
        hasta: TAMANO_BLOQUE_NUMEROS * 2,
      });
    });

    it('dos dispositivos pidiendo a la vez reciben rangos disjuntos', async () => {
      const respuestas = await Promise.all([
        comoA(http().post('/api/v1/encargos/reservar-bloque-numeros')),
        comoA(http().post('/api/v1/encargos/reservar-bloque-numeros')),
        comoA(http().post('/api/v1/encargos/reservar-bloque-numeros')),
      ]);

      const rangos = respuestas
        .map((r) => r.body as { desde: number; hasta: number })
        .sort((uno, otro) => uno.desde - otro.desde);

      expect(new Set(rangos.map((r) => r.desde)).size).toBe(3);
      // Contiguos y sin solaparse: cada uno empieza justo después del anterior.
      expect(rangos[1].desde).toBe(rangos[0].hasta + 1);
      expect(rangos[2].desde).toBe(rangos[1].hasta + 1);
    });

    it('el contador es por negocio: el de B no avanza cuando A reserva', async () => {
      const negocioB = (await prisma.negocio.findUnique({ where: { googleUid: uidB } }))!;

      expect(negocioB.siguienteBloqueNumeros).toBe(TAMANO_BLOQUE_NUMEROS * 2 + 1);
    });
  });

  describe('GET /encargos', () => {
    it('envoltura paginada y orden por fecha acordada', async () => {
      const res = await comoA(http().get('/api/v1/encargos'));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ pagina: 1, por_pagina: 20 });
      const fechas = res.body.datos.map(
        (e: { fecha_entrega_acordada: string }) => e.fecha_entrega_acordada,
      );
      expect(fechas).toEqual([...fechas].sort());
    });

    it('filtra por estado', async () => {
      const res = await comoA(http().get('/api/v1/encargos').query({ estado: 'CANCELADO' }));

      expect(res.body.datos).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('filtra por cliente', async () => {
      const otro = await crearCliente(tokenA, 'Otro cliente de A');
      await crear({ cliente_id: otro, fecha_entrega_acordada: '2026-11-05' });

      const res = await comoA(http().get('/api/v1/encargos').query({ cliente_id: otro }));

      expect(res.body.total).toBe(1);
      expect(res.body.datos[0].cliente_id).toBe(otro);
    });

    it('filtra por rango de fechas sobre la acordada', async () => {
      await crear({ fecha_entrega_acordada: '2026-12-24' });

      const dentro = await comoA(
        http()
          .get('/api/v1/encargos')
          .query({ fecha_desde: '2026-12-01', fecha_hasta: '2026-12-31' }),
      );
      expect(
        dentro.body.datos.every((e: { fecha_entrega_acordada: string }) =>
          e.fecha_entrega_acordada.startsWith('2026-12'),
        ),
      ).toBe(true);
      expect(dentro.body.total).toBeGreaterThan(0);

      const fuera = await comoA(
        http().get('/api/v1/encargos').query({ fecha_desde: '2027-01-01' }),
      );
      expect(fuera.body.total).toBe(0);
    });

    it('un estado inexistente → 400', async () => {
      const res = await comoA(http().get('/api/v1/encargos').query({ estado: 'INVENTADO' }));

      expect(res.status).toBe(400);
    });

    it('cada negocio solo ve sus encargos', async () => {
      const deB = await comoB(http().get('/api/v1/encargos'));

      expect(deB.body.datos.every((e: { cliente_id: string }) => e.cliente_id === clienteB)).toBe(
        true,
      );
    });
  });

  describe('GET /encargos/{id}', () => {
    it('devuelve el detalle', async () => {
      const creado = await crear();
      const res = await comoA(http().get(`/api/v1/encargos/${creado.body.id}`));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(creado.body.id);
    });

    it('un encargo de otro negocio → 404, nunca 403', async () => {
      const creado = await crear();
      const res = await comoB(http().get(`/api/v1/encargos/${creado.body.id}`));

      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
    });
  });

  describe('PATCH /encargos/{id}', () => {
    let id: string;

    beforeEach(async () => {
      id = (await crear()).body.id;
    });

    it('reprogramar mueve la acordada y deja intacta la prometida', async () => {
      const res = await comoA(http().patch(`/api/v1/encargos/${id}`)).send({
        fecha_entrega_acordada: '2026-10-25',
      });

      expect(res.status).toBe(200);
      expect(res.body.fecha_entrega_acordada).toBe('2026-10-25');
      expect(res.body.fecha_entrega_prometida).toBe('2026-10-15');
    });

    it('edita descripción, ubicación y notas; null borra', async () => {
      await comoA(http().patch(`/api/v1/encargos/${id}`)).send({ ubicacion_fisica: 'Estante 3' });
      const res = await comoA(http().patch(`/api/v1/encargos/${id}`)).send({
        descripcion: 'Arreglo urgente',
        ubicacion_fisica: null,
        notas_generales: 'Cliente apurado',
      });

      expect(res.body).toMatchObject({
        descripcion: 'Arreglo urgente',
        ubicacion_fisica: null,
        notas_generales: 'Cliente apurado',
      });
    });

    it('un descuento sin trabajos → 422 y no se guarda', async () => {
      const res = await comoA(http().patch(`/api/v1/encargos/${id}`)).send({ descuento: 5 });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('DESCUENTO_INVALIDO');

      const sigue = await comoA(http().get(`/api/v1/encargos/${id}`));
      expect(sigue.body.descuento).toBe(0);
    });

    it('un PATCH sin cambios reales no mueve actualizado_en', async () => {
      const antes = await comoA(http().get(`/api/v1/encargos/${id}`));
      const res = await comoA(http().patch(`/api/v1/encargos/${id}`)).send({
        descripcion: 'Arreglo de pantalón',
      });

      expect(res.body.actualizado_en).toBe(antes.body.actualizado_en);
    });

    it('no acepta fecha_listo ni estado por esta vía (whitelist)', async () => {
      const res = await comoA(http().patch(`/api/v1/encargos/${id}`)).send({
        fecha_listo: '2026-10-01',
        estado: 'ENTREGADO',
      });

      expect(res.status).toBe(200);
      expect(res.body.fecha_listo).toBeNull();
      expect(res.body.estado).toBe('INGRESADO');
    });

    it('un encargo de otro negocio → 404 y no se modifica', async () => {
      const res = await comoB(http().patch(`/api/v1/encargos/${id}`)).send({
        descripcion: 'Ajeno',
      });

      expect(res.status).toBe(404);
      const sigue = await comoA(http().get(`/api/v1/encargos/${id}`));
      expect(sigue.body.descripcion).toBe('Arreglo de pantalón');
    });
  });

  describe('PATCH /encargos/{id}/estado', () => {
    let id: string;
    const hoy = new Date().toISOString().slice(0, 10);

    beforeEach(async () => {
      id = (await crear()).body.id;
    });

    const cambiar = (estado: string) =>
      comoA(http().patch(`/api/v1/encargos/${id}/estado`)).send({ estado });

    it('LISTO asigna fecha_listo sola, sin tocar fecha_entrega_real', async () => {
      const res = await cambiar('LISTO');

      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('LISTO');
      expect(res.body.fecha_listo).toBe(hoy);
      expect(res.body.fecha_entrega_real).toBeNull();
      expect(res.body.advertencias).toEqual([]);
    });

    it('ENTREGADO directo desde INGRESADO deja las dos fechas iguales', async () => {
      const res = await cambiar('ENTREGADO');

      expect(res.body.fecha_listo).toBe(hoy);
      expect(res.body.fecha_entrega_real).toBe(hoy);
    });

    it('ENTREGADO es terminal: no se puede cancelar después → 422', async () => {
      await cambiar('ENTREGADO');
      const res = await cambiar('CANCELADO');

      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        codigo: 'TRANSICION_INVALIDA',
        detalles: { desde: 'ENTREGADO', hasta: 'CANCELADO' },
      });
    });

    it('cancelar y reactivar funciona (fue un error)', async () => {
      expect((await cambiar('CANCELADO')).body.estado).toBe('CANCELADO');
      expect((await cambiar('EN_PROCESO')).body.estado).toBe('EN_PROCESO');
    });

    it('repetir el estado actual no mueve actualizado_en', async () => {
      const antes = await comoA(http().get(`/api/v1/encargos/${id}`));
      const res = await cambiar('INGRESADO');

      expect(res.status).toBe(200);
      expect(res.body.actualizado_en).toBe(antes.body.actualizado_en);
    });

    it('un estado inexistente → 400', async () => {
      const res = await cambiar('EN_REVISION');

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    });

    it('un encargo de otro negocio → 404', async () => {
      const res = await comoB(http().patch(`/api/v1/encargos/${id}/estado`)).send({
        estado: 'LISTO',
      });

      expect(res.status).toBe(404);
    });
  });
});
