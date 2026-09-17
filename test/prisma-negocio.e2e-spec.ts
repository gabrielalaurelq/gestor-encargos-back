import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { NegocioAjenoError } from '../src/shared/infrastructure/prisma/filtro-negocio';
import { ClienteNegocio } from '../src/shared/infrastructure/prisma/prisma-negocio';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';

// Las dos capas de multitenancy del Doc 4 Bloque 5 contra el Postgres local:
// la extensión de Prisma (filtro/inyección de negocioId) y RLS (rol gestor_app,
// FORCE ROW LEVEL SECURITY, app.negocio_actual). Dos negocios, A y B, y se
// comprueba que ninguno ve ni toca lo del otro.
describe('ClienteNegocio (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let negocioA: string;
  let negocioB: string;
  let clienteDeB: string;
  let A: ClienteNegocio;
  let B: ClienteNegocio;
  const marca = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = app.get(PrismaService);

    negocioA = (await prisma.negocio.create({ data: { googleUid: `A-${marca}` } })).id;
    negocioB = (await prisma.negocio.create({ data: { googleUid: `B-${marca}` } })).id;
    A = new ClienteNegocio(prisma, negocioA);
    B = new ClienteNegocio(prisma, negocioB);

    clienteDeB = (
      await B.transaccion((tx) =>
        tx.cliente.create({ data: { nombre: 'Beatriz', negocioId: negocioB } }),
      )
    ).id;
  });

  afterAll(async () => {
    await prisma?.negocio.deleteMany({
      where: { googleUid: { in: [`A-${marca}`, `B-${marca}`] } },
    });
    await app?.close();
  });

  it('create sin negocioId lo inyecta desde la sesión (los tipos lo exigen; el runtime lo garantiza)', async () => {
    const creado = await A.transaccion((tx) =>
      tx.cliente.create({
        data: { nombre: 'Ana' } as Parameters<typeof tx.cliente.create>[0]['data'],
      }),
    );

    expect(creado.negocioId).toBe(negocioA);
  });

  it('findMany solo devuelve filas del propio negocio', async () => {
    const deA = await A.transaccion((tx) => tx.cliente.findMany());
    const deB = await B.transaccion((tx) => tx.cliente.findMany());

    expect(deA.map((c) => c.nombre)).toEqual(['Ana']);
    expect(deB.map((c) => c.nombre)).toEqual(['Beatriz']);
  });

  it('findUnique por id de otro negocio devuelve null (base del 404 del Doc 5, nunca 403)', async () => {
    const resultado = await A.transaccion((tx) =>
      tx.cliente.findUnique({ where: { id: clienteDeB } }),
    );

    expect(resultado).toBeNull();
  });

  it('updateMany/deleteMany sobre filas ajenas afectan 0 registros', async () => {
    const actualizados = await A.transaccion((tx) =>
      tx.cliente.updateMany({ where: { id: clienteDeB }, data: { nombre: 'Hackeada' } }),
    );
    const borrados = await A.transaccion((tx) =>
      tx.cliente.deleteMany({ where: { id: clienteDeB } }),
    );
    const intacta = await B.transaccion((tx) =>
      tx.cliente.findUnique({ where: { id: clienteDeB } }),
    );

    expect(actualizados.count).toBe(0);
    expect(borrados.count).toBe(0);
    expect(intacta?.nombre).toBe('Beatriz');
  });

  it('count y filtros propios se combinan con el del negocio', async () => {
    const total = await A.transaccion((tx) =>
      tx.cliente.count({ where: { nombre: { contains: 'a' } } }),
    );

    expect(total).toBe(1);
  });

  it('pasar un negocioId ajeno a mano falla en voz alta, antes de llegar a la base', async () => {
    await expect(
      A.transaccion((tx) =>
        tx.cliente.create({ data: { nombre: 'Intrusa', negocioId: negocioB } }),
      ),
    ).rejects.toBeInstanceOf(NegocioAjenoError);
  });

  it('RLS por sí sola (sin la extensión) también aísla: la fila de B es invisible para A', async () => {
    // prisma.enNegocio fija la variable de sesión pero no filtra en la app.
    const vistasDesdeA = await prisma.enNegocio(negocioA, (tx) =>
      tx.cliente.findMany({ where: { id: clienteDeB } }),
    );
    // Y sin variable de sesión, nadie ve nada (falla cerrado).
    const sinSesion = await prisma.cliente.count();

    expect(vistasDesdeA).toEqual([]);
    expect(sinSesion).toBe(0);
  });

  it('las tablas sin negocio_id (origenes_pago) siguen accesibles dentro de la transacción', async () => {
    const origenes = await A.transaccion((tx) => tx.origenPago.findMany());

    expect(origenes.map((o) => o.nombre).sort()).toEqual([
      'Efectivo',
      'Plin',
      'Transferencia',
      'Yape',
    ]);
  });
});
