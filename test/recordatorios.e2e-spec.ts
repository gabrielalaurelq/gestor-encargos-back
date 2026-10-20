import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configurarAplicacion } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { Ambiente } from '../src/config/env.validation';
import { VerificadorIdentidad } from '../src/modules/auth/application/ports/verificador-identidad';
import { EvaluarRecordatoriosUseCase } from '../src/modules/recordatorios/application/evaluar-recordatorios.use-case';
import { ErrorAutenticacion } from '../src/shared/application/error-autenticacion';
import { MensajePush, Notificador } from '../src/shared/application/notificador';
import { hoyEnZonaNegocio, isoDesdeFecha } from '../src/shared/domain/fecha';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

const DIA = 86_400_000;

// PRD 13 / Doc 8 Bloque 3: `EvaluarRecordatoriosUseCase` contra el Postgres
// local con RLS real, llamado directo (sin esperar al cron) y con un FCM de
// mentira que registra lo enviado. La base es compartida, así que cada prueba
// mira solo los envíos dirigidos al token de su propio negocio.
describe('Recordatorios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uid = `recordatorios-${marca}`;
  const token = `fcm-${marca}`;
  let jwt: string;
  let negocioId: string;
  let clienteId: string;
  const enviados: { tokens: string[]; mensaje: MensajePush }[] = [];
  let invalidos: string[] = [];

  const notificador = {
    enviar: jest.fn(async (tokens: string[], mensaje: MensajePush) => {
      enviados.push({ tokens, mensaje });
      return {
        enviados: tokens.length,
        tokensInvalidos: tokens.filter((t) => invalidos.includes(t)),
      };
    }),
  };

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
      .overrideProvider(Notificador)
      .useValue(notificador)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configurarAplicacion(app, Ambiente.development);
    await app.init();
    prisma = app.get(PrismaService);

    const login = await http()
      .post('/api/v1/auth/login')
      .send({ id_token: `valido-${uid}` });
    jwt = login.body.access_token;
    negocioId = (await prisma.negocio.findUniqueOrThrow({ where: { googleUid: uid } })).id;
    await como(http().post('/api/v1/dispositivos/fcm-token'))
      .send({ fcm_token: token })
      .expect(204);
    clienteId = (await como(http().post('/api/v1/clientes')).send({ nombre: 'Ana García' })).body
      .id;
  });

  beforeEach(async () => {
    enviados.length = 0;
    invalidos = [];
    // Cada prueba arma su propio escenario: se cancela lo de la anterior.
    await prisma.enNegocio(negocioId, (tx) =>
      tx.encargo.updateMany({ data: { estado: 'CANCELADO' } }),
    );
  });

  afterAll(async () => {
    await prisma?.negocio.deleteMany({ where: { googleUid: uid } });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const como = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${jwt}`);

  /** 9:00 de Lima del día `fecha` (AAAA-MM-DD). */
  const nueveDeLima = (fecha: string) => new Date(`${fecha}T14:00:00.000Z`);
  const hoy = isoDesdeFecha(hoyEnZonaNegocio());
  const masDias = (fecha: string, n: number) =>
    isoDesdeFecha(new Date(new Date(`${fecha}T00:00:00.000Z`).getTime() + n * DIA));

  async function encargo(descripcion: string, acordada: string): Promise<string> {
    const res = await como(http().post('/api/v1/encargos')).send({
      cliente_id: clienteId,
      descripcion,
      fecha_entrega_acordada: acordada,
    });
    return res.body.id;
  }

  const delNegocio = () => enviados.filter((e) => e.tokens.includes(token));
  const titulos = () => delNegocio().map((e) => e.mensaje.titulo);

  it('entrega hoy: nombra el encargo y enlaza a él', async () => {
    const id = await encargo('Vestido rojo', '2026-12-10');

    await app.get(EvaluarRecordatoriosUseCase).execute(nueveDeLima('2026-12-10'));

    expect(delNegocio()).toEqual([
      {
        tokens: [token],
        mensaje: {
          titulo: 'Entrega hoy',
          cuerpo: expect.stringContaining('Vestido rojo — Ana García'),
          datos: { tipo: 'ENTREGA_HOY', encargo_id: id },
        },
      },
    ]);
  });

  it('varios atrasados → una sola notificación resumen (regla 9)', async () => {
    await encargo('Uno', '2026-12-01');
    await encargo('Dos', '2026-12-02');
    await encargo('Tres', '2026-12-03');

    await app.get(EvaluarRecordatoriosUseCase).execute(nueveDeLima('2026-12-08'));

    expect(delNegocio()).toEqual([
      expect.objectContaining({
        mensaje: expect.objectContaining({
          titulo: 'Trabajo atrasado',
          cuerpo: 'Tienes 3 trabajos atrasados',
        }),
      }),
    ]);
  });

  it('reprogramar mueve el aviso a la nueva fecha acordada (Caso 15)', async () => {
    const id = await encargo('Reprogramado', '2026-12-10');
    await como(http().patch(`/api/v1/encargos/${id}`))
      .send({ fecha_entrega_acordada: '2026-12-12' })
      .expect(200);

    await app.get(EvaluarRecordatoriosUseCase).execute(nueveDeLima('2026-12-11'));

    expect(titulos()).toEqual(['Entrega mañana']);
  });

  it('PAUSADO no avisa', async () => {
    const id = await encargo('Pausado', '2026-12-01');
    await como(http().patch(`/api/v1/encargos/${id}/estado`))
      .send({ estado: 'PAUSADO' })
      .expect(200);

    await app.get(EvaluarRecordatoriosUseCase).execute(nueveDeLima('2026-12-08'));

    expect(delNegocio()).toEqual([]);
  });

  it('cliente no recoge: usa el umbral configurado del negocio', async () => {
    const id = await encargo('Listo sin recoger', masDias(hoy, 30));
    await como(http().patch(`/api/v1/encargos/${id}/estado`))
      .send({ estado: 'LISTO', fecha: hoy })
      .expect(200);
    await como(http().patch('/api/v1/negocio')).send({ dias_aviso_no_recoge: 4 }).expect(200);

    await app.get(EvaluarRecordatoriosUseCase).execute(nueveDeLima(masDias(hoy, 3)));
    expect(titulos()).toEqual([]);

    await app.get(EvaluarRecordatoriosUseCase).execute(nueveDeLima(masDias(hoy, 4)));
    expect(titulos()).toEqual(['Cliente no recoge']);
  });

  it('un token que FCM declara inválido se suelta, sin cerrar la sesión', async () => {
    await encargo('Cualquiera', '2026-12-10');
    invalidos = [token];

    await app.get(EvaluarRecordatoriosUseCase).execute(nueveDeLima('2026-12-10'));

    const dispositivo = await prisma.enNegocio(negocioId, (tx) =>
      tx.dispositivo.findFirstOrThrow({ select: { fcmToken: true, refreshTokenHash: true } }),
    );
    expect(dispositivo.fcmToken).toBeNull();
    expect(dispositivo.refreshTokenHash).toEqual(expect.any(String));
    // Para las pruebas siguientes, el dispositivo vuelve a registrar su token.
    await como(http().post('/api/v1/dispositivos/fcm-token'))
      .send({ fcm_token: token })
      .expect(204);
  });
});
