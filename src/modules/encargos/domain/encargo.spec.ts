import { Monto } from '../../../shared/domain/monto';
import { Encargo, SumasEncargo } from './encargo';
import { EstadoEncargo } from './estado-encargo';

const CLIENTE = '11111111-2222-3333-4444-555555555555';
const HOY = new Date(Date.UTC(2026, 9, 20)); // 2026-10-20

const sumas = (trabajos: number, pagos: number): SumasEncargo => ({
  trabajos: Monto.desde(trabajos),
  pagos: Monto.desde(pagos),
});

const nuevo = (extra: Record<string, unknown> = {}) =>
  Encargo.crear({
    clienteId: CLIENTE,
    descripcion: 'Arreglo de pantalón',
    fechaEntregaAcordada: '2026-10-15',
    ...extra,
  });

const persistido = (extra: Record<string, unknown> = {}) =>
  Encargo.reconstituir({
    id: 'e1',
    clienteId: CLIENTE,
    numero: 47,
    descripcion: 'Arreglo de pantalón',
    estado: EstadoEncargo.INGRESADO,
    precioTotal: '0.00',
    descuento: '0.00',
    saldoPendiente: '0.00',
    fechaEntregaPrometida: new Date(Date.UTC(2026, 9, 15)),
    fechaEntregaAcordada: new Date(Date.UTC(2026, 9, 15)),
    fechaListo: null,
    fechaEntregaReal: null,
    ubicacionFisica: null,
    notasGenerales: null,
    creadoEn: new Date('2026-10-01T10:00:00Z'),
    actualizadoEn: new Date('2026-10-01T10:00:00Z'),
    ...extra,
  });

describe('Encargo (agregado raíz, Doc 2)', () => {
  describe('crear', () => {
    it('nace INGRESADO con los derivados en cero (invariante 9)', () => {
      const encargo = nuevo();

      expect(encargo.estado).toBe(EstadoEncargo.INGRESADO);
      expect(encargo.precioTotal.esCero).toBe(true);
      expect(encargo.saldoPendiente.esCero).toBe(true);
      expect(encargo.descuento.esCero).toBe(true);
    });

    it('la fecha prometida y la acordada arrancan iguales (invariante 6)', () => {
      const { fechas } = nuevo();

      expect(fechas.entregaPrometida).toEqual(fechas.entregaAcordada);
      expect(fechas.fueReprogramado).toBe(false);
      expect(fechas.listo).toBeNull();
      expect(fechas.entregaReal).toBeNull();
    });

    it('sin fecha de entrega acordada → ENCARGO_SIN_FECHA', () => {
      expect(() => Encargo.crear({ clienteId: CLIENTE, descripcion: 'X' })).toThrow(
        expect.objectContaining({ codigo: 'ENCARGO_SIN_FECHA' }),
      );
    });

    it('descripción vacía → ENCARGO_DESCRIPCION_VACIA', () => {
      expect(() => nuevo({ descripcion: '   ' })).toThrow(
        expect.objectContaining({ codigo: 'ENCARGO_DESCRIPCION_VACIA' }),
      );
    });

    it('sin trabajos, cualquier descuento positivo rompe el invariante 2', () => {
      expect(() => nuevo({ descuento: 10 })).toThrow(
        expect.objectContaining({
          codigo: 'DESCUENTO_INVALIDO',
          detalles: { descuento_solicitado: 10, suma_trabajos: 0 },
        }),
      );
      expect(nuevo({ descuento: 0 }).descuento.esCero).toBe(true);
    });

    it('descuento negativo → DESCUENTO_INVALIDO', () => {
      expect(() => nuevo({ descuento: -5 })).toThrow(
        expect.objectContaining({ codigo: 'DESCUENTO_INVALIDO' }),
      );
    });

    it('el número es opcional: null = "Pendiente" (Doc 4)', () => {
      expect(nuevo().numero).toBeNull();
      expect(nuevo({ numero: 47 }).numero).toBe(47);
    });

    it('los textos opcionales vacíos quedan en null, no en cadena vacía', () => {
      const encargo = nuevo({ ubicacionFisica: '  ', notasGenerales: 'Cliente apurado' });

      expect(encargo.ubicacionFisica).toBeNull();
      expect(encargo.notasGenerales).toBe('Cliente apurado');
    });
  });

  describe('recalcular (invariantes 1-3)', () => {
    it('precio_total = Σ trabajos − descuento', () => {
      const encargo = persistido({ descuento: '5.00' });

      encargo.recalcular(sumas(30, 0));

      expect(encargo.precioTotal.texto).toBe('25.00');
    });

    it('saldo_pendiente = precio_total − Σ pagos', () => {
      const encargo = persistido();

      encargo.recalcular(sumas(30, 10));

      expect(encargo.saldoPendiente.texto).toBe('20.00');
    });

    it('el saldo puede quedar negativo: saldo a favor del cliente (invariante 3)', () => {
      const encargo = persistido();

      encargo.recalcular(sumas(30, 50));

      expect(encargo.saldoPendiente.texto).toBe('-20.00');
      expect(encargo.saldoPendiente.esNegativo).toBe(true);
    });

    it('si la suma de trabajos baja del descuento, el descuento se ajusta solo', () => {
      const encargo = persistido({ descuento: '20.00' });

      // Se borró un trabajo y la suma quedó por debajo del descuento vigente.
      encargo.recalcular(sumas(12, 0));

      expect(encargo.descuento.texto).toBe('12.00');
      // Nunca deja el total en negativo (invariante 2).
      expect(encargo.precioTotal.texto).toBe('0.00');
    });
  });

  describe('aplicar (PATCH parcial)', () => {
    it('reprogramar mueve solo la acordada (invariantes 6-7)', () => {
      const encargo = persistido();

      expect(encargo.aplicar({ fechaEntregaAcordada: '2026-10-25' })).toBe(true);
      expect(encargo.fechas.entregaAcordada.toISOString()).toBe('2026-10-25T00:00:00.000Z');
      expect(encargo.fechas.entregaPrometida.toISOString()).toBe('2026-10-15T00:00:00.000Z');
      expect(encargo.fechas.fueReprogramado).toBe(true);
    });

    it('reprogramar a la misma fecha no es un cambio', () => {
      expect(persistido().aplicar({ fechaEntregaAcordada: '2026-10-15' })).toBe(false);
    });

    it('un descuento por encima de la suma se rechaza, no se ajusta', () => {
      const encargo = persistido();

      expect(() => encargo.aplicar({ descuento: 50 }, sumas(30, 0))).toThrow(
        expect.objectContaining({ codigo: 'DESCUENTO_INVALIDO' }),
      );
      expect(encargo.descuento.esCero).toBe(true);
    });

    it('un descuento válido recalcula el total', () => {
      const encargo = persistido();

      expect(encargo.aplicar({ descuento: 5 }, sumas(30, 10))).toBe(true);
      expect(encargo.precioTotal.texto).toBe('25.00');
      expect(encargo.saldoPendiente.texto).toBe('15.00');
    });

    it('un PATCH sin cambios reales devuelve false', () => {
      const encargo = persistido();

      expect(encargo.aplicar({})).toBe(false);
      expect(encargo.aplicar({ descripcion: 'Arreglo de pantalón', descuento: 0 })).toBe(false);
    });

    it('null borra los textos opcionales', () => {
      const encargo = persistido({ ubicacionFisica: 'Cajón azul' });

      expect(encargo.aplicar({ ubicacionFisica: null })).toBe(true);
      expect(encargo.ubicacionFisica).toBeNull();
    });

    it('una fecha mal formada → FECHA_INVALIDA', () => {
      expect(() => persistido().aplicar({ fechaEntregaAcordada: '25/10/2026' })).toThrow(
        expect.objectContaining({ codigo: 'FECHA_INVALIDA' }),
      );
    });
  });

  describe('transicionarA (Doc 2, reglas 3-4)', () => {
    it('LISTO asigna fecha_listo sola (invariante 8)', () => {
      const encargo = persistido();

      expect(encargo.transicionarA(EstadoEncargo.LISTO, HOY)).toEqual([]);
      expect(encargo.fechas.listo).toEqual(HOY);
      expect(encargo.fechas.entregaReal).toBeNull();
    });

    it('ENTREGADO asigna fecha_entrega_real sola', () => {
      const encargo = persistido({
        estado: EstadoEncargo.LISTO,
        fechaListo: new Date(Date.UTC(2026, 9, 18)),
      });

      encargo.transicionarA(EstadoEncargo.ENTREGADO, HOY);

      expect(encargo.fechas.entregaReal).toEqual(HOY);
      // La fecha de terminado no se reescribe.
      expect(encargo.fechas.listo?.toISOString()).toBe('2026-10-18T00:00:00.000Z');
    });

    it('al saltarse LISTO, ambas fechas quedan iguales (PRD módulo 6)', () => {
      const encargo = persistido();

      encargo.transicionarA(EstadoEncargo.ENTREGADO, HOY);

      expect(encargo.fechas.listo).toEqual(HOY);
      expect(encargo.fechas.entregaReal).toEqual(HOY);
    });

    it('entregar con saldo pendiente se permite y advierte (invariante 10)', () => {
      const encargo = persistido({ precioTotal: '30.00', saldoPendiente: '30.00' });

      const advertencias = encargo.transicionarA(EstadoEncargo.ENTREGADO, HOY);

      expect(encargo.estado).toBe(EstadoEncargo.ENTREGADO);
      expect(advertencias).toEqual([
        {
          codigo: 'SALDO_PENDIENTE',
          mensaje: 'Queda un saldo pendiente de S/ 30.00.',
          detalles: { saldo_pendiente: 30 },
        },
      ]);
    });

    it('sin saldo pendiente no hay advertencia', () => {
      expect(persistido().transicionarA(EstadoEncargo.ENTREGADO, HOY)).toEqual([]);
    });

    it('un saldo a favor del cliente tampoco advierte', () => {
      const encargo = persistido({ saldoPendiente: '-10.00' });

      expect(encargo.transicionarA(EstadoEncargo.ENTREGADO, HOY)).toEqual([]);
    });

    it('repetir el estado actual no hace nada', () => {
      const encargo = persistido();

      expect(encargo.transicionarA(EstadoEncargo.INGRESADO, HOY)).toEqual([]);
      expect(encargo.fechas.listo).toBeNull();
    });

    it('una transición no permitida → TRANSICION_INVALIDA', () => {
      const encargo = persistido({ estado: EstadoEncargo.ENTREGADO });

      expect(() => encargo.transicionarA(EstadoEncargo.CANCELADO, HOY)).toThrow(
        expect.objectContaining({
          codigo: 'TRANSICION_INVALIDA',
          detalles: { desde: 'ENTREGADO', hasta: 'CANCELADO' },
        }),
      );
    });

    it('cancelar y reactivar conserva las fechas', () => {
      const encargo = persistido({ estado: EstadoEncargo.EN_PROCESO });

      encargo.transicionarA(EstadoEncargo.CANCELADO, HOY);
      encargo.transicionarA(EstadoEncargo.EN_PROCESO, HOY);

      expect(encargo.estado).toBe(EstadoEncargo.EN_PROCESO);
      expect(encargo.fechas.entregaAcordada.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    });
  });

  describe('estaAtrasado (Doc 2, alerta 6)', () => {
    it('vencida y sin terminar → atrasado', () => {
      expect(persistido().fechas.estaAtrasado(HOY)).toBe(true);
    });

    it('en cuanto se marca LISTO deja de estar atrasado', () => {
      const encargo = persistido();

      encargo.transicionarA(EstadoEncargo.LISTO, HOY);

      expect(encargo.fechas.estaAtrasado(HOY)).toBe(false);
    });

    it('reprogramar reinicia el reloj de la alerta', () => {
      const encargo = persistido();

      encargo.aplicar({ fechaEntregaAcordada: '2026-10-30' });

      expect(encargo.fechas.estaAtrasado(HOY)).toBe(false);
    });
  });
});
