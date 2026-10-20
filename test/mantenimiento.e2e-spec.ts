import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NegocioPlan } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configurarAplicacion } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { Ambiente } from '../src/config/env.validation';
import { VerificadorIdentidad } from '../src/modules/auth/application/ports/verificador-identidad';
import { AlmacenamientoFotos } from '../src/shared/application/almacenamiento-fotos';
import { PurgarTombstonesUseCase } from '../src/modules/mantenimiento/application/purgar-tombstones.use-case';
import { RevertirPlanesVencidosUseCase } from '../src/modules/mantenimiento/application/revertir-planes-vencidos.use-case';
import { ErrorAutenticacion } from '../src/shared/application/error-autenticacion';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

const DIA = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);

// Doc 8 Bloque 3 / Doc 10: los jobs de mantenimiento, llamando a sus casos de
// uso directamente (sin esperar al cron), y el `410` de `/sync` que protege a
// los dispositivos de la purga (Doc 5 v1.5). Contra el Postgres local con RLS
// real: la purga corre sin sesión, negocio por negocio con `enNegocio()`.
describe('Mantenimiento: purga, planes y sync vencido (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `mant-A-${marca}`;
  const uidB = `mant-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let negocioA: string;
  let negocioB: string;
  let clienteA: string;
  // R2 de mentira: firmar es local, pero borrar habla con la red.
  const almacenamiento = {
    urlSubida: jest.fn(async (clave: string) => ({
      url: `https://r2.test/put/${clave}`,
      expiraEn: new Date(),
    })),
    urlDescarga: jest.fn(async (clave: string) => ({
      url: `https://r2.test/get/${clave}`,
      expiraEn: new Date(),
    })),
    eliminar: jest.fn(async () => undefined),
  };

  beforeEach(() => almacenamiento.eliminar.mockClear());

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
      .overrideProvider(AlmacenamientoFotos)
      .useValue(almacenamiento)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configurarAplicacion(app, Ambiente.development);
    await app.init();
    prisma = app.get(PrismaService);

    tokenA = await login(uidA);
    tokenB = await login(uidB);
    negocioA = (await prisma.negocio.findUniqueOrThrow({ where: { googleUid: uidA } })).id;
    negocioB = (await prisma.negocio.findUniqueOrThrow({ where: { googleUid: uidB } })).id;
    clienteA = (await comoA(http().post('/api/v1/clientes')).send({ nombre: 'Cliente' })).body.id;
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

  /** Encargo con un trabajo (con un material) y un pago; devuelve sus ids. */
  async function encargoCompleto() {
    const encargo = await comoA(http().post('/api/v1/encargos')).send({
      cliente_id: clienteA,
      descripcion: 'Encargo',
      fecha_entrega_acordada: '2026-11-15',
    });
    const id = encargo.body.id as string;
    const trabajo = await comoA(http().post(`/api/v1/encargos/${id}/trabajos`)).send({
      descripcion: 'Trabajo',
      precio: 100,
    });
    const trabajoId = trabajo.body.trabajo.id as string;
    const material = await comoA(
      http().post(`/api/v1/encargos/${id}/trabajos/${trabajoId}/materiales`),
    ).send({ nombre: 'Tela' });
    const origen = await prisma.origenPago.findFirstOrThrow({ orderBy: { id: 'asc' } });
    const pago = await comoA(http().post(`/api/v1/encargos/${id}/pagos`)).send({
      monto: 40,
      origen_id: origen.id,
      tipo: 'ADELANTO',
    });
    return { id, trabajoId, materialId: material.body.id, pagoId: pago.body.pago.id };
  }

  describe('PurgarTombstonesUseCase', () => {
    it('borra físicamente solo los tombstones más viejos que el horizonte', async () => {
      const viejo = await encargoCompleto();
      const reciente = await encargoCompleto();
      const vivo = await encargoCompleto();
      for (const e of [viejo, reciente]) {
        await comoA(http().delete(`/api/v1/encargos/${e.id}/trabajos/${e.trabajoId}`)).expect(200);
        await comoA(http().delete(`/api/v1/encargos/${e.id}/pagos/${e.pagoId}`)).expect(200);
      }
      // Envejecer los tombstones de `viejo` (fuera de enNegocio, RLS no deja verlos).
      await prisma.enNegocio(negocioA, async (tx) => {
        await tx.trabajo.updateMany({
          where: { id: viejo.trabajoId },
          data: { eliminadoEn: hace(91) },
        });
        await tx.material.updateMany({
          where: { id: viejo.materialId },
          data: { eliminadoEn: hace(91) },
        });
        await tx.pago.updateMany({ where: { id: viejo.pagoId }, data: { eliminadoEn: hace(91) } });
      });

      const resumen = await app.get(PurgarTombstonesUseCase).execute();

      expect(resumen.fallidos).toEqual([]);
      const existe = await prisma.enNegocio(negocioA, async (tx) => ({
        trabajoViejo: await tx.trabajo.count({ where: { id: viejo.trabajoId } }),
        materialViejo: await tx.material.count({ where: { id: viejo.materialId } }),
        pagoViejo: await tx.pago.count({ where: { id: viejo.pagoId } }),
        trabajoReciente: await tx.trabajo.count({ where: { id: reciente.trabajoId } }),
        pagoReciente: await tx.pago.count({ where: { id: reciente.pagoId } }),
        trabajoVivo: await tx.trabajo.count({ where: { id: vivo.trabajoId } }),
      }));
      expect(existe).toEqual({
        trabajoViejo: 0,
        materialViejo: 0,
        pagoViejo: 0,
        trabajoReciente: 1, // tombstone reciente: todavía tiene que propagarse
        pagoReciente: 1,
        trabajoVivo: 1,
      });
    });

    it('purgar no altera los derivados: el saldo ya excluía el pago borrado', async () => {
      const e = await encargoCompleto();
      await comoA(http().delete(`/api/v1/encargos/${e.id}/pagos/${e.pagoId}`)).expect(200);
      await prisma.enNegocio(negocioA, (tx) =>
        tx.pago.updateMany({ where: { id: e.pagoId }, data: { eliminadoEn: hace(91) } }),
      );

      await app.get(PurgarTombstonesUseCase).execute();

      const detalle = await comoA(http().get(`/api/v1/encargos/${e.id}`));
      expect(detalle.body).toMatchObject({ precio_total: 100, saldo_pendiente: 100, pagos: [] });
    });

    /** Objeto con una foto, ambos con tombstone de la antigüedad indicada. */
    async function objetoConFoto(diasObjeto: number, diasFoto: number | null) {
      const encargo = await comoA(http().post('/api/v1/encargos')).send({
        cliente_id: clienteA,
        descripcion: 'Con foto',
        fecha_entrega_acordada: '2026-11-15',
      });
      const objeto = await comoA(http().post(`/api/v1/encargos/${encargo.body.id}/objetos`)).send({
        descripcion: 'Zapato',
      });
      const foto = await comoA(http().post(`/api/v1/encargos/${encargo.body.id}/fotos`)).send({
        objeto_recibido_id: objeto.body.objeto.id,
      });
      await prisma.enNegocio(negocioA, async (tx) => {
        await tx.foto.update({
          where: { id: foto.body.id },
          data: { eliminadoEn: diasFoto === null ? null : hace(diasFoto) },
        });
        await tx.objetoRecibido.update({
          where: { id: objeto.body.objeto.id },
          data: { eliminadoEn: hace(diasObjeto) },
        });
      });
      const { clave } = await prisma.enNegocio(negocioA, (tx) =>
        tx.foto.findUniqueOrThrow({ where: { id: foto.body.id } }),
      );
      return { objetoId: objeto.body.objeto.id as string, fotoId: foto.body.id as string, clave };
    }

    const existen = (objetoId: string, fotoId: string) =>
      prisma.enNegocio(negocioA, async (tx) => ({
        objeto: await tx.objetoRecibido.count({ where: { id: objetoId } }),
        foto: await tx.foto.count({ where: { id: fotoId } }),
      }));

    it('foto vencida: se borra su archivo en R2, después la fila, y entonces cae su objeto', async () => {
      const { objetoId, fotoId, clave } = await objetoConFoto(91, 91);

      await app.get(PurgarTombstonesUseCase).execute();

      expect(almacenamiento.eliminar).toHaveBeenCalledWith(expect.arrayContaining([clave]));
      expect(await existen(objetoId, fotoId)).toEqual({ objeto: 0, foto: 0 });
    });

    it('objeto vencido con una foto viva: no se purga (el CASCADE la borraría sin borrar R2)', async () => {
      const { objetoId, fotoId, clave } = await objetoConFoto(91, null);

      await app.get(PurgarTombstonesUseCase).execute();

      expect(almacenamiento.eliminar).not.toHaveBeenCalledWith(expect.arrayContaining([clave]));
      expect(await existen(objetoId, fotoId)).toEqual({ objeto: 1, foto: 1 });
    });

    it('si R2 falla, ninguna fila del negocio se borra: se reintenta la semana siguiente', async () => {
      const { objetoId, fotoId } = await objetoConFoto(91, 91);
      almacenamiento.eliminar.mockRejectedValueOnce(new Error('R2 caído'));

      const resumen = await app.get(PurgarTombstonesUseCase).execute();

      expect(resumen.fallidos).toContain(negocioA);
      expect(await existen(objetoId, fotoId)).toEqual({ objeto: 1, foto: 1 });
    });
  });

  describe('RevertirPlanesVencidosUseCase', () => {
    it('PREMIUM vencido → FREE; vigente y FREE no se tocan', async () => {
      await prisma.negocio.update({
        where: { id: negocioA },
        data: { plan: NegocioPlan.PREMIUM, planVenceEn: hace(1) },
      });
      const vigente = new Date(Date.now() + 10 * DIA);
      await prisma.negocio.update({
        where: { id: negocioB },
        data: { plan: NegocioPlan.PREMIUM, planVenceEn: vigente },
      });

      await app.get(RevertirPlanesVencidosUseCase).execute();

      const [a, b] = await Promise.all([
        prisma.negocio.findUniqueOrThrow({ where: { id: negocioA } }),
        prisma.negocio.findUniqueOrThrow({ where: { id: negocioB } }),
      ]);
      expect(a.plan).toBe(NegocioPlan.FREE);
      expect(a.planVenceEn).not.toBeNull(); // queda como constancia de cuándo venció
      expect(b).toMatchObject({ plan: NegocioPlan.PREMIUM, planVenceEn: vigente });
    });
  });

  describe('GET /sync — 410 para un dispositivo que quedó atrás de la purga', () => {
    const syncComo = (token: string, since?: string) =>
      http()
        .get('/api/v1/sync')
        .query(since ? { since } : {})
        .set('Authorization', `Bearer ${token}`);

    const fijarUltimaSync = (negocioId: string, valor: Date | null) =>
      prisma.enNegocio(negocioId, (tx) =>
        tx.dispositivo.updateMany({ data: { ultimaSyncEn: valor } }),
      );

    it('since y última sync viejos → 410 SYNC_DEMASIADO_ANTIGUO, sin marcar la sync', async () => {
      await fijarUltimaSync(negocioB, hace(120));

      const res = await syncComo(tokenB, hace(120).toISOString());

      expect(res.status).toBe(410);
      expect(res.body.error).toMatchObject({
        codigo: 'SYNC_DEMASIADO_ANTIGUO',
        detalles: { since_minimo: expect.any(String) },
      });
      // Reintentar el mismo since viejo sigue dando 410: el 410 no marcó la sync.
      expect((await syncComo(tokenB, hace(120).toISOString())).status).toBe(410);
    });

    it('tras el 410, el resync completo (sin since) funciona y marca la sync', async () => {
      await fijarUltimaSync(negocioB, hace(120));

      expect((await syncComo(tokenB)).status).toBe(200);

      const dispositivo = await prisma.enNegocio(negocioB, (tx) =>
        tx.dispositivo.findFirstOrThrow({ select: { ultimaSyncEn: true } }),
      );
      expect(Date.now() - dispositivo.ultimaSyncEn!.getTime()).toBeLessThan(60_000);
    });

    it('página 2 de un resync: since viejo pero sync reciente → 200, sin bucle', async () => {
      await syncComo(tokenB).expect(200); // página 1: marca la sync

      const res = await syncComo(tokenB, hace(400).toISOString());

      expect(res.status).toBe(200);
    });

    it('dispositivo sin última sync conocida y since viejo → 410 (ante la duda, resync)', async () => {
      await fijarUltimaSync(negocioB, null);

      expect((await syncComo(tokenB, hace(91).toISOString())).status).toBe(410);
    });

    it('since dentro del horizonte → 200 aunque la última sync sea desconocida', async () => {
      await fijarUltimaSync(negocioB, null);

      expect((await syncComo(tokenB, hace(89).toISOString())).status).toBe(200);
    });
  });
});
