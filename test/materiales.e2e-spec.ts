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

// Doc 5 Bloque 2: `/encargos/{id}/trabajos/{trabajoId}/materiales` (PRD 15) y
// el borrado lógico en cascada que reproduce el `ON DELETE` del Doc 4 —
// trabajo → materiales (CASCADE) y objeto → trabajos (SET NULL) — para que el
// delta sync nunca entregue un hijo vivo colgando de un padre borrado.
describe('Materiales y cascada de borrados (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `materiales-A-${marca}`;
  const uidB = `materiales-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let clienteA: string;

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
    const cliente = await comoA(http().post('/api/v1/clientes')).send({ nombre: 'Cliente' });
    clienteA = cliente.body.id;
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

  async function nuevoEncargo(): Promise<string> {
    const res = await comoA(http().post('/api/v1/encargos')).send({
      cliente_id: clienteA,
      descripcion: 'Vestido',
      fecha_entrega_acordada: '2026-11-15',
    });
    return res.body.id;
  }

  async function nuevoTrabajo(encargoId: string, extra: Record<string, unknown> = {}) {
    const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
      descripcion: 'Confección',
      precio: 200,
      ...extra,
    });
    return res.body.trabajo.id as string;
  }

  const rutaMateriales = (encargoId: string, trabajoId: string) =>
    `/api/v1/encargos/${encargoId}/trabajos/${trabajoId}/materiales`;

  /** Lo que verá el próximo `/sync` de un dispositivo que sincronizó en `desde`. */
  async function syncDesde(desde: string) {
    const res = await comoA(http().get(`/api/v1/sync?since=${encodeURIComponent(desde)}`));
    return res.body.cambios;
  }

  describe('POST', () => {
    let encargoId: string;
    let trabajoId: string;

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
      trabajoId = await nuevoTrabajo(encargoId);
    });

    it('solo con nombre → 201, sin envoltura de derivados (como las notas)', async () => {
      const res = await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send({
        nombre: '  Cierre  ',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        trabajo_id: trabajoId,
        nombre: 'Cierre',
        cantidad: null,
        costo: null,
        creado_en: expect.any(String),
        actualizado_en: expect.any(String),
      });
    });

    it('el costo es informativo: no mueve precio_total ni saldo', async () => {
      await comoA(http().post(rutaMateriales(encargoId, trabajoId)))
        .send({ nombre: 'Tela', cantidad: '3 metros', costo: 450.5 })
        .expect(201);

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));

      expect(detalle.body).toMatchObject({ precio_total: 200, saldo_pendiente: 200 });
      expect(detalle.body.trabajos[0].materiales).toEqual([
        expect.objectContaining({ nombre: 'Tela', cantidad: '3 metros', costo: 450.5 }),
      ]);
    });

    it('el detalle anida cada material en su trabajo', async () => {
      const otro = await nuevoTrabajo(encargoId, { descripcion: 'Bastilla', precio: 15 });
      await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send({ nombre: 'Tela' });
      await comoA(http().post(rutaMateriales(encargoId, otro))).send({ nombre: 'Hilo' });

      const { body } = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      const nombres = (id: string) =>
        body.trabajos
          .find((t: { id: string }) => t.id === id)
          .materiales.map((m: { nombre: string }) => m.nombre);

      expect(nombres(trabajoId)).toEqual(['Tela']);
      expect(nombres(otro)).toEqual(['Hilo']);
    });

    it('idempotente: reintentar con el mismo id → 200 con lo guardado', async () => {
      const id = randomUUID();
      await comoA(http().post(rutaMateriales(encargoId, trabajoId)))
        .send({ id, nombre: 'Tela' })
        .expect(201);

      const res = await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send({
        id,
        nombre: 'Otro nombre',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, nombre: 'Tela' });
    });

    it.each([
      [{ nombre: ' ' }, 'MATERIAL_NOMBRE_VACIO'],
      [{ nombre: 'Tela', costo: -1 }, 'MATERIAL_COSTO_INVALIDO'],
      [{ nombre: 'Tela', costo: 1.234 }, 'MONTO_INVALIDO'],
    ])('%j → 422 %s', async (cuerpo, codigo) => {
      const res = await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send(cuerpo);

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe(codigo);
    });

    it('sin nombre → 400 (DTO)', async () => {
      const res = await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send({});

      expect(res.status).toBe(400);
    });

    it('trabajo de otro encargo → 404', async () => {
      const ajeno = await nuevoTrabajo(await nuevoEncargo());

      const res = await comoA(http().post(rutaMateriales(encargoId, ajeno))).send({
        nombre: 'Tela',
      });

      expect(res.status).toBe(404);
    });

    it('trabajo borrado → 404 (no se cuelga un material vivo de un tombstone)', async () => {
      await comoA(http().delete(`/api/v1/encargos/${encargoId}/trabajos/${trabajoId}`)).expect(200);

      const res = await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send({
        nombre: 'Tela',
      });

      expect(res.status).toBe(404);
    });

    it('otro negocio → 404, nunca 403', async () => {
      const res = await comoB(http().post(rutaMateriales(encargoId, trabajoId))).send({
        nombre: 'Tela',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE', () => {
    let encargoId: string;
    let trabajoId: string;
    let materialId: string;

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
      trabajoId = await nuevoTrabajo(encargoId);
      const res = await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send({
        nombre: 'Tela',
      });
      materialId = res.body.id;
    });

    it('204 sin cuerpo; desaparece del detalle y viaja como tombstone por sync', async () => {
      const antes = new Date().toISOString();

      const res = await comoA(
        http().delete(`${rutaMateriales(encargoId, trabajoId)}/${materialId}`),
      );

      expect(res.status).toBe(204);
      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.trabajos[0].materiales).toEqual([]);
      const { materiales } = await syncDesde(antes);
      expect(materiales).toContainEqual(
        expect.objectContaining({ id: materialId, eliminado_en: expect.any(String) }),
      );
    });

    it('borrar dos veces → 404 la segunda', async () => {
      const ruta = `${rutaMateriales(encargoId, trabajoId)}/${materialId}`;
      await comoA(http().delete(ruta)).expect(204);

      expect((await comoA(http().delete(ruta))).status).toBe(404);
    });

    it('con el trabajo equivocado en la ruta → 404', async () => {
      const otro = await nuevoTrabajo(encargoId);

      const res = await comoA(http().delete(`${rutaMateriales(encargoId, otro)}/${materialId}`));

      expect(res.status).toBe(404);
    });

    it('otro negocio → 404', async () => {
      const res = await comoB(
        http().delete(`${rutaMateriales(encargoId, trabajoId)}/${materialId}`),
      );

      expect(res.status).toBe(404);
    });
  });

  describe('cascada de borrados lógicos (Doc 4, ON DELETE)', () => {
    it('borrar un trabajo marca borrados sus materiales, con la misma marca', async () => {
      const encargoId = await nuevoEncargo();
      const trabajoId = await nuevoTrabajo(encargoId);
      const material = await comoA(http().post(rutaMateriales(encargoId, trabajoId))).send({
        nombre: 'Tela',
      });
      const antes = new Date().toISOString();

      await comoA(http().delete(`/api/v1/encargos/${encargoId}/trabajos/${trabajoId}`)).expect(200);

      const { trabajos, materiales } = await syncDesde(antes);
      const trabajo = trabajos.find((t: { id: string }) => t.id === trabajoId);
      const hijo = materiales.find((m: { id: string }) => m.id === material.body.id);
      expect(hijo.eliminado_en).toEqual(expect.any(String));
      expect(hijo.eliminado_en).toBe(trabajo.eliminado_en);
    });

    it('no toca materiales de otros trabajos ni re-marca tombstones previos', async () => {
      const encargoId = await nuevoEncargo();
      const borrar = await nuevoTrabajo(encargoId);
      const conservar = await nuevoTrabajo(encargoId);
      const viejo = await comoA(http().post(rutaMateriales(encargoId, borrar))).send({
        nombre: 'Ya borrado',
      });
      await comoA(http().delete(`${rutaMateriales(encargoId, borrar)}/${viejo.body.id}`)).expect(
        204,
      );
      await comoA(http().post(rutaMateriales(encargoId, conservar))).send({ nombre: 'Hilo' });
      const marcaDelViejo = async () => {
        const { materiales } = await syncDesde(new Date(0).toISOString());
        return materiales.find((m: { id: string }) => m.id === viejo.body.id).actualizado_en;
      };
      const antes = await marcaDelViejo();

      await comoA(http().delete(`/api/v1/encargos/${encargoId}/trabajos/${borrar}`)).expect(200);

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.trabajos[0].materiales).toEqual([
        expect.objectContaining({ nombre: 'Hilo' }),
      ]);
      // Re-marcar un tombstone movería su `actualizado_en` y lo reenviaría por
      // sync sin motivo.
      expect(await marcaDelViejo()).toBe(antes);
    });

    it('borrar un objeto deja sin objeto a los trabajos que lo referenciaban (SET NULL)', async () => {
      const encargoId = await nuevoEncargo();
      const objeto = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'Pantalón',
      });
      const objetoId = objeto.body.objeto.id;
      const trabajoId = await nuevoTrabajo(encargoId, { objeto_recibido_id: objetoId });
      const antes = new Date().toISOString();

      await comoA(http().delete(`/api/v1/encargos/${encargoId}/objetos/${objetoId}`)).expect(200);

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.trabajos).toEqual([
        expect.objectContaining({ id: trabajoId, objeto_recibido_id: null }),
      ]);
      // El trabajo sigue vivo (Caso 7: puede no tener objeto) y viaja por sync
      // con el vínculo ya roto, para que los otros dispositivos lo sepan.
      const { trabajos } = await syncDesde(antes);
      expect(trabajos).toContainEqual(
        expect.objectContaining({ id: trabajoId, objeto_recibido_id: null, eliminado_en: null }),
      );
    });
  });
});
