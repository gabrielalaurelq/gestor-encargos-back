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

// Doc 5 Bloque 2 / Doc 8 Bloque 3 / PRD 14: fotos con URLs firmadas de R2.
// Usa la implementación R2 **real**: firmar es un HMAC local, así que funciona
// con las credenciales de plantilla del .env sin tocar la red. Lo único que
// habla con R2 es borrar, y eso lo cubre el e2e de mantenimiento con un doble.
describe('Fotos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `fotos-A-${marca}`;
  const uidB = `fotos-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let negocioA: string;
  let clienteA: string;
  let encargoId: string;

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
    negocioA = (await prisma.negocio.findUniqueOrThrow({ where: { googleUid: uidA } })).id;
    clienteA = (await comoA(http().post('/api/v1/clientes')).send({ nombre: 'Cliente' })).body.id;
  });

  beforeEach(async () => {
    encargoId = (
      await comoA(http().post('/api/v1/encargos')).send({
        cliente_id: clienteA,
        descripcion: 'Zapatos',
        fecha_entrega_acordada: '2026-11-15',
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

  const rutaFotos = () => `/api/v1/encargos/${encargoId}/fotos`;

  async function nuevoObjeto(): Promise<string> {
    const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
      descripcion: 'Zapato izquierdo',
    });
    return res.body.objeto.id;
  }

  describe('POST', () => {
    it('foto general: 201 con URL de subida firmada a la clave del Doc 8', async () => {
      const res = await comoA(http().post(rutaFotos())).send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        objeto_recibido_id: null,
        url_descarga: expect.any(String),
        url_descarga_expira_en: expect.any(String),
        upload_url: expect.any(String),
        upload_url_expira_en: expect.any(String),
        creado_en: expect.any(String),
        actualizado_en: expect.any(String),
      });
      const subida = new URL(res.body.upload_url);
      expect(subida.pathname).toMatch(
        new RegExp(`/negocios/${negocioA}/encargos/${encargoId}/fotos/${res.body.id}\\.jpg$`),
      );
      expect(subida.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
      expect(subida.searchParams.get('X-Amz-Expires')).toBe('3600');
    });

    it('foto de un objeto: queda vinculada', async () => {
      const objetoId = await nuevoObjeto();

      const res = await comoA(http().post(rutaFotos())).send({ objeto_recibido_id: objetoId });

      expect(res.status).toBe(201);
      expect(res.body.objeto_recibido_id).toBe(objetoId);
    });

    it('varias fotos del mismo objeto, sin reemplazar la anterior (PRD 14)', async () => {
      const objetoId = await nuevoObjeto();
      await comoA(http().post(rutaFotos())).send({ objeto_recibido_id: objetoId }).expect(201);
      await comoA(http().post(rutaFotos())).send({ objeto_recibido_id: objetoId }).expect(201);

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));

      expect(detalle.body.fotos).toHaveLength(2);
    });

    it('reenviar el mismo id → 200 con una URL de subida (vía de reintento)', async () => {
      const id = randomUUID();
      await comoA(http().post(rutaFotos())).send({ id }).expect(201);

      const res = await comoA(http().post(rutaFotos())).send({ id });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.upload_url).toContain(`/fotos/${id}.jpg`);
    });

    it('objeto de otro encargo → 422 OBJETO_NO_EN_ENCARGO', async () => {
      const otroEncargo = (
        await comoA(http().post('/api/v1/encargos')).send({
          cliente_id: clienteA,
          descripcion: 'Otro',
          fecha_entrega_acordada: '2026-11-15',
        })
      ).body.id;
      const ajeno = (
        await comoA(http().post(`/api/v1/encargos/${otroEncargo}/objetos`)).send({
          descripcion: 'Ajeno',
        })
      ).body.objeto.id;

      const res = await comoA(http().post(rutaFotos())).send({ objeto_recibido_id: ajeno });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('OBJETO_NO_EN_ENCARGO');
    });

    it('objeto borrado → 422 (no se cuelga una foto de un tombstone)', async () => {
      const objetoId = await nuevoObjeto();
      await comoA(http().delete(`/api/v1/encargos/${encargoId}/objetos/${objetoId}`)).expect(200);

      const res = await comoA(http().post(rutaFotos())).send({ objeto_recibido_id: objetoId });

      expect(res.status).toBe(422);
    });

    it('encargo de otro negocio → 404', async () => {
      expect((await comoB(http().post(rutaFotos())).send({})).status).toBe(404);
    });
  });

  describe('lecturas', () => {
    it('GET /encargos/{id} trae las fotos con URL de descarga firmada', async () => {
      const foto = await comoA(http().post(rutaFotos())).send({});

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));

      expect(detalle.body.fotos).toEqual([
        expect.objectContaining({ id: foto.body.id, objeto_recibido_id: null }),
      ]);
      const descarga = new URL(detalle.body.fotos[0].url_descarga);
      expect(descarga.pathname).toContain(`/fotos/${foto.body.id}.jpg`);
      expect(descarga.searchParams.get('X-Amz-Expires')).toBe('604800');
    });

    it('/sync entrega url_descarga y nunca la clave interna; un tombstone sin URL', async () => {
      const antes = new Date().toISOString();
      const viva = await comoA(http().post(rutaFotos())).send({});
      const borrada = await comoA(http().post(rutaFotos())).send({});
      await comoA(http().delete(`${rutaFotos()}/${borrada.body.id}`)).expect(204);

      const { body } = await comoA(http().get('/api/v1/sync').query({ since: antes }));
      const porId = (id: string) => body.cambios.fotos.find((f: { id: string }) => f.id === id);

      expect(porId(viva.body.id)).toMatchObject({
        encargo_id: encargoId,
        url_descarga: expect.stringContaining(`/fotos/${viva.body.id}.jpg`),
        eliminado_en: null,
      });
      expect(porId(viva.body.id)).not.toHaveProperty('clave');
      expect(porId(borrada.body.id)).toMatchObject({
        url_descarga: null,
        eliminado_en: expect.any(String),
      });
    });
  });

  describe('DELETE', () => {
    it('204, desaparece del detalle; dos veces → 404', async () => {
      const foto = await comoA(http().post(rutaFotos())).send({});
      const ruta = `${rutaFotos()}/${foto.body.id}`;

      expect((await comoA(http().delete(ruta))).status).toBe(204);
      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.fotos).toEqual([]);
      expect((await comoA(http().delete(ruta))).status).toBe(404);
    });

    it('otro negocio → 404', async () => {
      const foto = await comoA(http().post(rutaFotos())).send({});

      expect((await comoB(http().delete(`${rutaFotos()}/${foto.body.id}`))).status).toBe(404);
    });

    it('borrar el objeto marca borradas sus fotos (cascada del Doc 4), no las generales', async () => {
      const objetoId = await nuevoObjeto();
      const delObjeto = await comoA(http().post(rutaFotos())).send({
        objeto_recibido_id: objetoId,
      });
      const general = await comoA(http().post(rutaFotos())).send({});

      await comoA(http().delete(`/api/v1/encargos/${encargoId}/objetos/${objetoId}`)).expect(200);

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.fotos.map((f: { id: string }) => f.id)).toEqual([general.body.id]);
      const borrada = await prisma.enNegocio(negocioA, (tx) =>
        tx.foto.findUniqueOrThrow({ where: { id: delObjeto.body.id } }),
      );
      expect(borrada.eliminadoEn).not.toBeNull();
    });
  });
});
