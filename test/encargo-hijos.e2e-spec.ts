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

// Doc 5 Bloque 2 — hijos del agregado Encargo, contra el Postgres local con
// RLS real. Es el primer sitio donde `precio_total` y `saldo_pendiente` se
// mueven de verdad: hasta ahora las sumas del agregado eran siempre 0.
describe('Hijos del encargo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marca = randomUUID();
  const uidA = `hijos-A-${marca}`;
  const uidB = `hijos-B-${marca}`;
  let tokenA: string;
  let tokenB: string;
  let clienteA: string;
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
    clienteA = await crearCliente(tokenA);

    // `origenes_pago` lo siembra prisma/seed.ts (Efectivo, Transferencia, Yape, Plin).
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

  async function crearCliente(token: string): Promise<string> {
    const res = await http()
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Cliente de prueba' });
    return res.body.id;
  }

  const comoA = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenA}`);
  const comoB = (peticion: request.Test) => peticion.set('Authorization', `Bearer ${tokenB}`);

  async function nuevoEncargo(): Promise<string> {
    const res = await comoA(http().post('/api/v1/encargos')).send({
      cliente_id: clienteA,
      descripcion: 'Encargo de prueba',
      fecha_entrega_acordada: '2026-11-15',
    });
    return res.body.id;
  }

  async function nuevoServicio(nombre: string, precio: number): Promise<string> {
    const res = await comoA(http().post('/api/v1/servicios')).send({ nombre, precio });
    return res.body.id;
  }

  describe('objetos', () => {
    let encargoId: string;

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
    });

    it('POST crea y no toca los campos calculados', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: '  Pantalón azul  ',
      });

      expect(res.status).toBe(201);
      expect(res.body.objeto).toMatchObject({ descripcion: 'Pantalón azul' });
      expect(res.body.encargo).toMatchObject({ precio_total: 0, saldo_pendiente: 0 });
    });

    it('descripción vacía → 422', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: ' ',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('OBJETO_DESCRIPCION_VACIA');
    });

    it('PATCH edita; sin cambios reales no mueve actualizado_en', async () => {
      const creado = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'Pantalón azul',
      });
      const ruta = `/api/v1/encargos/${encargoId}/objetos/${creado.body.objeto.id}`;

      const editado = await comoA(http().patch(ruta)).send({ descripcion: 'Pantalón negro' });
      expect(editado.body.objeto.descripcion).toBe('Pantalón negro');

      const igual = await comoA(http().patch(ruta)).send({ descripcion: 'Pantalón negro' });
      expect(igual.body.objeto.actualizado_en).toBe(editado.body.objeto.actualizado_en);
    });

    it('DELETE es lógico: desaparece del detalle pero la fila sigue', async () => {
      const creado = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'Se borrará',
      });
      const objetoId = creado.body.objeto.id;

      const borrado = await comoA(
        http().delete(`/api/v1/encargos/${encargoId}/objetos/${objetoId}`),
      );
      expect(borrado.status).toBe(200);

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.objetos).toEqual([]);

      // El tombstone sigue en la base para que el delta sync lo propague.
      const negocioId = (await prisma.negocio.findUnique({ where: { googleUid: uidA } }))!.id;
      const fila = await prisma.enNegocio(negocioId, (tx) =>
        tx.objetoRecibido.findUnique({ where: { id: objetoId } }),
      );
      expect(fila!.eliminadoEn).not.toBeNull();
    });

    it('borrar dos veces → 404 la segunda', async () => {
      const creado = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'X',
      });
      const ruta = `/api/v1/encargos/${encargoId}/objetos/${creado.body.objeto.id}`;

      expect((await comoA(http().delete(ruta))).status).toBe(200);
      expect((await comoA(http().delete(ruta))).status).toBe(404);
    });

    it('un encargo de otro negocio → 404', async () => {
      const res = await comoB(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'Ajeno',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('trabajos', () => {
    let encargoId: string;

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
    });

    const crearTrabajo = (cuerpo: Record<string, unknown>) =>
      comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send(cuerpo);

    it('personalizado: suma al precio_total y al saldo_pendiente', async () => {
      const res = await crearTrabajo({ descripcion: 'Confección', precio: 150 });

      expect(res.status).toBe(201);
      expect(res.body.trabajo).toMatchObject({
        descripcion: 'Confección',
        precio: 150,
        servicio_id: null,
        precio_bloqueado: false,
      });
      expect(res.body.encargo).toMatchObject({ precio_total: 150, saldo_pendiente: 150 });
    });

    it('desde el catálogo: copia nombre y precio, y los bloquea', async () => {
      const servicioId = await nuevoServicio(`Basta ${marca}`, 20);

      const res = await crearTrabajo({ servicio_id: servicioId });

      expect(res.body.trabajo).toMatchObject({
        descripcion: `Basta ${marca}`,
        precio: 20,
        servicio_id: servicioId,
        precio_bloqueado: true,
      });
    });

    it('editar el catálogo después NO cambia el trabajo ya creado (invariante 12)', async () => {
      const servicioId = await nuevoServicio(`Basta retro ${marca}`, 20);
      const creado = await crearTrabajo({ servicio_id: servicioId });

      await comoA(http().patch(`/api/v1/servicios/${servicioId}`)).send({ precio: 22 });

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      const trabajo = detalle.body.trabajos.find(
        (t: { id: string }) => t.id === creado.body.trabajo.id,
      );
      expect(trabajo.precio).toBe(20);
      expect(detalle.body.precio_total).toBe(20);
    });

    it('un servicio desactivado no sirve para trabajos nuevos → 422', async () => {
      const servicioId = await nuevoServicio(`Descatalogado ${marca}`, 15);
      await comoA(http().patch(`/api/v1/servicios/${servicioId}`)).send({ activo: false });

      const res = await crearTrabajo({ servicio_id: servicioId });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    });

    it('un servicio de otro negocio → 422, no 500 por la FK', async () => {
      const res = await crearTrabajo({ servicio_id: randomUUID() });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    });

    it('mandar las dos vías a la vez → 422 TRABAJO_ORIGEN_AMBIGUO', async () => {
      const servicioId = await nuevoServicio(`Ambiguo ${marca}`, 10);

      const res = await crearTrabajo({ servicio_id: servicioId, descripcion: 'X', precio: 5 });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('TRABAJO_ORIGEN_AMBIGUO');
    });

    it('no mandar ninguna vía → 422', async () => {
      const res = await crearTrabajo({});

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('TRABAJO_ORIGEN_AMBIGUO');
    });

    it('PATCH del precio de un trabajo del catálogo → 422 TRABAJO_PRECIO_BLOQUEADO', async () => {
      const servicioId = await nuevoServicio(`Bloqueado ${marca}`, 20);
      const creado = await crearTrabajo({ servicio_id: servicioId });

      const res = await comoA(
        http().patch(`/api/v1/encargos/${encargoId}/trabajos/${creado.body.trabajo.id}`),
      ).send({ precio: 30 });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('TRABAJO_PRECIO_BLOQUEADO');
    });

    it('PATCH del precio de un personalizado recalcula el total', async () => {
      const creado = await crearTrabajo({ descripcion: 'Arreglo', precio: 50 });

      const res = await comoA(
        http().patch(`/api/v1/encargos/${encargoId}/trabajos/${creado.body.trabajo.id}`),
      ).send({ precio: 80 });

      expect(res.body.trabajo.precio).toBe(80);
      expect(res.body.encargo.precio_total).toBe(80);
    });

    it('vincular a un objeto de otro encargo → 422 OBJETO_NO_EN_ENCARGO', async () => {
      const otroEncargo = await nuevoEncargo();
      const objetoAjeno = await comoA(http().post(`/api/v1/encargos/${otroEncargo}/objetos`)).send({
        descripcion: 'De otro encargo',
      });

      const res = await crearTrabajo({
        descripcion: 'X',
        precio: 10,
        objeto_recibido_id: objetoAjeno.body.objeto.id,
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('OBJETO_NO_EN_ENCARGO');
    });

    it('vincular a un objeto del mismo encargo funciona (Caso 6)', async () => {
      const objeto = await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'Pantalón',
      });

      const res = await crearTrabajo({
        descripcion: 'Basta',
        precio: 20,
        objeto_recibido_id: objeto.body.objeto.id,
      });

      expect(res.status).toBe(201);
      expect(res.body.trabajo.objeto_recibido_id).toBe(objeto.body.objeto.id);
    });

    it('DELETE resta del precio_total', async () => {
      const uno = await crearTrabajo({ descripcion: 'Uno', precio: 30 });
      await crearTrabajo({ descripcion: 'Dos', precio: 20 });

      const res = await comoA(
        http().delete(`/api/v1/encargos/${encargoId}/trabajos/${uno.body.trabajo.id}`),
      );

      expect(res.status).toBe(200);
      expect(res.body.precio_total).toBe(20);
    });

    it('varios trabajos suman exacto, sin error de coma flotante', async () => {
      // 0.07 × 3 con floats daría 0.21000000000000002.
      for (let i = 0; i < 3; i++) {
        await crearTrabajo({ descripcion: 'Céntimos', precio: 0.07 });
      }

      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.precio_total).toBe(0.21);
    });
  });

  describe('descuento y el invariante 2', () => {
    let encargoId: string;

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
    });

    it('con trabajos, el descuento ya se acepta', async () => {
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Trabajo',
        precio: 100,
      });

      const res = await comoA(http().patch(`/api/v1/encargos/${encargoId}`)).send({
        descuento: 20,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ descuento: 20, precio_total: 80, saldo_pendiente: 80 });
    });

    it('un descuento mayor que la suma sigue rechazándose', async () => {
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Trabajo',
        precio: 100,
      });

      const res = await comoA(http().patch(`/api/v1/encargos/${encargoId}`)).send({
        descuento: 120,
      });

      expect(res.status).toBe(422);
      expect(res.body.error.detalles).toEqual({
        descuento_solicitado: 120,
        suma_trabajos: 100,
      });
    });

    it('al borrar un trabajo, el descuento se ajusta solo (segunda mitad del invariante 2)', async () => {
      const uno = await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Caro',
        precio: 100,
      });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Barato',
        precio: 10,
      });
      await comoA(http().patch(`/api/v1/encargos/${encargoId}`)).send({ descuento: 50 });

      // Al irse el trabajo de 100, la suma baja a 10: por debajo del descuento.
      const res = await comoA(
        http().delete(`/api/v1/encargos/${encargoId}/trabajos/${uno.body.trabajo.id}`),
      );

      expect(res.status).toBe(200);
      expect(res.body.descuento).toBe(10);
      // Nunca deja el total en negativo.
      expect(res.body.precio_total).toBe(0);
    });
  });

  describe('pagos', () => {
    let encargoId: string;

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Trabajo',
        precio: 300,
      });
    });

    const crearPago = (cuerpo: Record<string, unknown>) =>
      comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send(cuerpo);

    it('un adelanto baja el saldo pendiente (PRD módulo 5)', async () => {
      const res = await crearPago({ monto: 100, origen_id: origenEfectivo, tipo: 'ADELANTO' });

      expect(res.status).toBe(201);
      expect(res.body.pago).toMatchObject({ monto: 100, tipo: 'ADELANTO' });
      expect(res.body.encargo).toMatchObject({ precio_total: 300, saldo_pendiente: 200 });
    });

    it('la fecha la pone el servidor', async () => {
      const res = await crearPago({ monto: 50, origen_id: origenEfectivo, tipo: 'PAGO' });

      expect(res.body.pago.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('varios pagos parciales se acumulan (Caso 5)', async () => {
      await crearPago({ monto: 100, origen_id: origenEfectivo, tipo: 'ADELANTO' });
      const segundo = await crearPago({ monto: 150, origen_id: origenEfectivo, tipo: 'PAGO' });

      expect(segundo.body.encargo.saldo_pendiente).toBe(50);
    });

    it('pagar de más deja el saldo negativo: saldo a favor (invariante 3)', async () => {
      const res = await crearPago({ monto: 400, origen_id: origenEfectivo, tipo: 'PAGO' });

      expect(res.body.encargo.saldo_pendiente).toBe(-100);
    });

    it.each([
      ['cero', 0],
      ['negativo', -10],
    ])('monto %s → 422 PAGO_MONTO_INVALIDO', async (_caso, monto) => {
      const res = await crearPago({ monto, origen_id: origenEfectivo, tipo: 'PAGO' });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('PAGO_MONTO_INVALIDO');
    });

    it('un origen inexistente → 422 ORIGEN_PAGO_INVALIDO, no 500 por la FK', async () => {
      const res = await crearPago({ monto: 50, origen_id: 9999, tipo: 'PAGO' });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('ORIGEN_PAGO_INVALIDO');
    });

    it('un tipo inexistente → 400', async () => {
      const res = await crearPago({ monto: 50, origen_id: origenEfectivo, tipo: 'REGALO' });

      expect(res.status).toBe(400);
    });

    it('DELETE devuelve el saldo y conserva el tombstone (invariante 15)', async () => {
      const pago = await crearPago({ monto: 100, origen_id: origenEfectivo, tipo: 'ADELANTO' });

      const res = await comoA(
        http().delete(`/api/v1/encargos/${encargoId}/pagos/${pago.body.pago.id}`),
      );

      expect(res.status).toBe(200);
      expect(res.body.saldo_pendiente).toBe(300);

      const negocioId = (await prisma.negocio.findUnique({ where: { googleUid: uidA } }))!.id;
      const fila = await prisma.enNegocio(negocioId, (tx) =>
        tx.pago.findUnique({ where: { id: pago.body.pago.id } }),
      );
      expect(fila!.eliminadoEn).not.toBeNull();
    });

    it('no existe PATCH de pagos', async () => {
      const pago = await crearPago({ monto: 100, origen_id: origenEfectivo, tipo: 'PAGO' });

      const res = await comoA(
        http().patch(`/api/v1/encargos/${encargoId}/pagos/${pago.body.pago.id}`),
      ).send({ monto: 200 });

      expect(res.status).toBe(404);
    });

    it('entregar con saldo pendiente advierte pero no bloquea (invariante 10)', async () => {
      await crearPago({ monto: 100, origen_id: origenEfectivo, tipo: 'ADELANTO' });

      const res = await comoA(http().patch(`/api/v1/encargos/${encargoId}/estado`)).send({
        estado: 'ENTREGADO',
      });

      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('ENTREGADO');
      expect(res.body.advertencias).toEqual([
        {
          codigo: 'SALDO_PENDIENTE',
          mensaje: 'Queda un saldo pendiente de S/ 200.00.',
          detalles: { saldo_pendiente: 200 },
        },
      ]);
    });
  });

  describe('fecha del dispositivo (Doc 2, invariante 4 y reglas 3-4)', () => {
    let encargoId: string;

    const diasAtras = (dias: number) =>
      new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Trabajo',
        precio: 300,
      });
    });

    it('un pago registrado sin conexion conserva SU fecha, no la de la sincronizacion', async () => {
      const haceTresDias = diasAtras(3);

      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 100,
        origen_id: origenEfectivo,
        tipo: 'ADELANTO',
        fecha: haceTresDias,
      });

      expect(res.status).toBe(201);
      // Es lo que necesita la Caja diaria (PRD modulo 12) para agrupar bien.
      expect(res.body.pago.fecha).toBe(haceTresDias);
    });

    it('sin fecha en el cuerpo, la pone el servidor', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 50,
        origen_id: origenEfectivo,
        tipo: 'PAGO',
      });

      expect(res.body.pago.fecha).toBe(diasAtras(0));
    });

    it('una fecha demasiado antigua -> 422 FECHA_FUERA_DE_RANGO', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 50,
        origen_id: origenEfectivo,
        tipo: 'PAGO',
        fecha: diasAtras(120),
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('FECHA_FUERA_DE_RANGO');
      expect(res.body.error.detalles.rango_aceptado).toMatchObject({
        desde: expect.any(String),
        hasta: expect.any(String),
      });
    });

    it('una fecha en el futuro mas alla de la tolerancia -> 422', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 50,
        origen_id: origenEfectivo,
        tipo: 'PAGO',
        fecha: diasAtras(-5),
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('FECHA_FUERA_DE_RANGO');
    });

    it('una fecha mal formada -> 422 FECHA_INVALIDA', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 50,
        origen_id: origenEfectivo,
        tipo: 'PAGO',
        fecha: '12/10/2026',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('FECHA_INVALIDA');
    });

    it('PATCH /estado graba fecha_listo con la fecha del dispositivo', async () => {
      const ayer = diasAtras(1);

      const res = await comoA(http().patch(`/api/v1/encargos/${encargoId}/estado`)).send({
        estado: 'LISTO',
        fecha: ayer,
      });

      expect(res.status).toBe(200);
      expect(res.body.fecha_listo).toBe(ayer);
    });

    it('al entregar saltandose LISTO, ambas fechas toman la del dispositivo', async () => {
      const ayer = diasAtras(1);

      const res = await comoA(http().patch(`/api/v1/encargos/${encargoId}/estado`)).send({
        estado: 'ENTREGADO',
        fecha: ayer,
      });

      expect(res.body.fecha_listo).toBe(ayer);
      expect(res.body.fecha_entrega_real).toBe(ayer);
    });

    it('una nota conserva la fecha del dispositivo', async () => {
      const haceDosDias = diasAtras(2);

      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/notas`)).send({
        texto: 'Anotado sin conexion',
        fecha: haceDosDias,
      });

      expect(res.body.fecha).toBe(haceDosDias);
    });

    it('creado_en y actualizado_en los sigue poniendo el servidor', async () => {
      const haceTresDias = diasAtras(3);

      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 70,
        origen_id: origenEfectivo,
        tipo: 'PAGO',
        fecha: haceTresDias,
      });

      // La fecha del hecho es del dispositivo; los metadatos del sync, del
      // servidor. Si el cliente pudiera mover actualizado_en, un telefono con
      // el reloj adelantado ganaria todos los conflictos de LWW.
      expect(res.body.pago.fecha).toBe(haceTresDias);
      expect(res.body.pago.creado_en.slice(0, 10)).toBe(diasAtras(0));
      expect(res.body.pago.actualizado_en.slice(0, 10)).toBe(diasAtras(0));
    });
  });

  describe('notas', () => {
    let encargoId: string;

    beforeEach(async () => {
      encargoId = await nuevoEncargo();
    });

    it('POST crea y devuelve solo la nota: no hay nada calculado que refrescar', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/notas`)).send({
        texto: '  Llamar antes de entregar  ',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ texto: 'Llamar antes de entregar' });
      expect(res.body.encargo).toBeUndefined();
    });

    it('texto vacío → 422', async () => {
      const res = await comoA(http().post(`/api/v1/encargos/${encargoId}/notas`)).send({
        texto: '  ',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('NOTA_TEXTO_VACIO');
    });

    it('no hay PATCH ni DELETE: una nota es inmutable (invariante 16)', async () => {
      const nota = await comoA(http().post(`/api/v1/encargos/${encargoId}/notas`)).send({
        texto: 'Inmutable',
      });
      const ruta = `/api/v1/encargos/${encargoId}/notas/${nota.body.id}`;

      expect((await comoA(http().patch(ruta)).send({ texto: 'Otro' })).status).toBe(404);
      expect((await comoA(http().delete(ruta))).status).toBe(404);
    });
  });

  describe('GET /encargos/{id} con los hijos anidados', () => {
    it('devuelve las cuatro colecciones, las notas de más reciente a más antigua', async () => {
      const encargoId = await nuevoEncargo();
      await comoA(http().post(`/api/v1/encargos/${encargoId}/objetos`)).send({
        descripcion: 'Pantalón',
      });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Basta',
        precio: 20,
      });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send({
        monto: 5,
        origen_id: origenEfectivo,
        tipo: 'ADELANTO',
      });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/notas`)).send({ texto: 'Primera' });
      await comoA(http().post(`/api/v1/encargos/${encargoId}/notas`)).send({ texto: 'Segunda' });

      const res = await comoA(http().get(`/api/v1/encargos/${encargoId}`));

      expect(res.status).toBe(200);
      expect(res.body.objetos).toHaveLength(1);
      expect(res.body.trabajos).toHaveLength(1);
      expect(res.body.pagos).toHaveLength(1);
      expect(res.body.notas.map((n: { texto: string }) => n.texto)).toEqual(['Segunda', 'Primera']);
      expect(res.body).toMatchObject({ precio_total: 20, saldo_pendiente: 15 });
      // Fotos llega en Sprint 7: la clave no se promete todavía.
      expect(res.body.fotos).toBeUndefined();
    });

    it('un encargo recién creado trae las colecciones vacías', async () => {
      const res = await comoA(http().get(`/api/v1/encargos/${await nuevoEncargo()}`));

      expect(res.body).toMatchObject({ objetos: [], trabajos: [], pagos: [], notas: [] });
    });
  });

  describe('idempotencia de los hijos', () => {
    it('reintentar un pago con el mismo id no lo cobra dos veces', async () => {
      const encargoId = await nuevoEncargo();
      await comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send({
        descripcion: 'Trabajo',
        precio: 300,
      });
      const id = randomUUID();
      const cuerpo = { id, monto: 100, origen_id: origenEfectivo, tipo: 'ADELANTO' };

      const uno = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send(cuerpo);
      const reintento = await comoA(http().post(`/api/v1/encargos/${encargoId}/pagos`)).send(
        cuerpo,
      );

      expect(uno.status).toBe(201);
      expect(reintento.status).toBe(200);
      // Lo que importa: el saldo no bajó dos veces.
      expect(reintento.body.encargo.saldo_pendiente).toBe(200);
    });

    it('dos reintentos simultáneos del mismo trabajo no duplican', async () => {
      const encargoId = await nuevoEncargo();
      const id = randomUUID();
      const cuerpo = { id, descripcion: 'Paralelo', precio: 40 };

      const respuestas = await Promise.all([
        comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send(cuerpo),
        comoA(http().post(`/api/v1/encargos/${encargoId}/trabajos`)).send(cuerpo),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 201]);
      const detalle = await comoA(http().get(`/api/v1/encargos/${encargoId}`));
      expect(detalle.body.trabajos).toHaveLength(1);
      expect(detalle.body.precio_total).toBe(40);
    });
  });
});
