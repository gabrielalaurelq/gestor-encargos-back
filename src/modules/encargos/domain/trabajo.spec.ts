import { Monto } from '../../../shared/domain/monto';
import { Trabajo } from './trabajo';

const SERVICIO = { id: 's1', nombre: 'Basta de jean', precio: Monto.desde(20) };

const persistido = (extra: Record<string, unknown> = {}) =>
  Trabajo.reconstituir({
    id: 't1',
    servicioId: null,
    objetoRecibidoId: null,
    descripcion: 'Arreglo a medida',
    precio: '25.00',
    creadoEn: new Date('2026-10-01T10:00:00Z'),
    actualizadoEn: new Date('2026-10-01T10:00:00Z'),
    ...extra,
  });

describe('Trabajo (hijo del agregado, Doc 2)', () => {
  describe('desde el catálogo', () => {
    it('copia el nombre del servicio como descripción y su precio', () => {
      const trabajo = Trabajo.desdeServicio({}, SERVICIO);

      expect(trabajo.descripcion).toBe('Basta de jean');
      expect(trabajo.precio.texto).toBe('20.00');
      expect(trabajo.servicioId).toBe('s1');
      expect(trabajo.precioBloqueado).toBe(true);
    });

    it('la copia es un valor, no una referencia viva (invariante 12)', () => {
      const trabajo = Trabajo.desdeServicio({}, SERVICIO);

      // El catálogo sube de precio después de crear el trabajo.
      const servicioEncarecido = { ...SERVICIO, precio: Monto.desde(22) };

      expect(trabajo.precio.texto).toBe('20.00');
      expect(servicioEncarecido.precio.texto).toBe('22.00');
    });

    it('rechaza editar el precio con TRABAJO_PRECIO_BLOQUEADO (invariante 13)', () => {
      const trabajo = Trabajo.desdeServicio({}, SERVICIO);

      expect(() => trabajo.aplicar({ precio: 30 })).toThrow(
        expect.objectContaining({
          codigo: 'TRABAJO_PRECIO_BLOQUEADO',
          detalles: { trabajo_id: trabajo.id, servicio_id: 's1' },
        }),
      );
      expect(trabajo.precio.texto).toBe('20.00');
    });

    it('la descripción sí es editable aunque el precio esté bloqueado', () => {
      const trabajo = Trabajo.desdeServicio({}, SERVICIO);

      expect(trabajo.aplicar({ descripcion: 'Basta de jean (urgente)' })).toBe(true);
      expect(trabajo.descripcion).toBe('Basta de jean (urgente)');
    });
  });

  describe('personalizado', () => {
    it('precio y descripción libres, y editables', () => {
      const trabajo = Trabajo.personalizado({ descripcion: 'Confección', precio: 150 });

      expect(trabajo.servicioId).toBeNull();
      expect(trabajo.precioBloqueado).toBe(false);
      expect(trabajo.aplicar({ precio: 180 })).toBe(true);
      expect(trabajo.precio.texto).toBe('180.00');
    });

    it('acepta precio 0 (PRD módulo 3: retoque de garantía)', () => {
      expect(Trabajo.personalizado({ descripcion: 'Retoque', precio: 0 }).precio.esCero).toBe(true);
    });

    it('rechaza precio negativo', () => {
      expect(() => Trabajo.personalizado({ descripcion: 'X', precio: -1 })).toThrow(
        expect.objectContaining({ codigo: 'TRABAJO_PRECIO_INVALIDO' }),
      );
    });

    it('rechaza descripción vacía', () => {
      expect(() => Trabajo.personalizado({ descripcion: '  ', precio: 10 })).toThrow(
        expect.objectContaining({ codigo: 'TRABAJO_DESCRIPCION_VACIA' }),
      );
    });

    it('un precio con 3 decimales → MONTO_INVALIDO, no se redondea', () => {
      expect(() => Trabajo.personalizado({ descripcion: 'X', precio: 10.555 })).toThrow(
        expect.objectContaining({ codigo: 'MONTO_INVALIDO' }),
      );
    });
  });

  describe('vínculo con el objeto (invariante 19)', () => {
    it('es opcional y se puede poner y quitar', () => {
      const trabajo = persistido();

      expect(trabajo.objetoRecibidoId).toBeNull();
      expect(trabajo.aplicar({ objetoRecibidoId: 'o1' })).toBe(true);
      expect(trabajo.objetoRecibidoId).toBe('o1');
      expect(trabajo.aplicar({ objetoRecibidoId: null })).toBe(true);
      expect(trabajo.objetoRecibidoId).toBeNull();
    });
  });

  it('un PATCH sin cambios reales devuelve false', () => {
    const trabajo = persistido();

    expect(trabajo.aplicar({})).toBe(false);
    expect(trabajo.aplicar({ descripcion: 'Arreglo a medida', precio: 25 })).toBe(false);
  });

  it('un trabajo rehidratado desde el catálogo sigue bloqueado', () => {
    expect(persistido({ servicioId: 's1' }).precioBloqueado).toBe(true);
  });
});
