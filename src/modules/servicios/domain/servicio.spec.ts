import { Servicio } from './servicio';

describe('Servicio (agregado, Doc 2 — Catálogo)', () => {
  const persistido = () =>
    Servicio.reconstituir({
      id: 'a',
      nombre: 'Basta de jean',
      precio: '20.00',
      activo: true,
      creadoEn: new Date('2026-09-01T10:00:00Z'),
      actualizadoEn: new Date('2026-09-01T10:00:00Z'),
    });

  describe('crear', () => {
    it('nace activo y con el precio dado', () => {
      const servicio = Servicio.crear({ nombre: 'Basta de jean', precio: 20 });

      expect(servicio.activo).toBe(true);
      expect(servicio.precio.texto).toBe('20.00');
      expect(servicio.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('respeta el UUID del dispositivo y recorta el nombre', () => {
      const id = '11111111-2222-3333-4444-555555555555';
      const servicio = Servicio.crear({ id, nombre: '  Basta  ', precio: 20 });

      expect(servicio.id).toBe(id);
      expect(servicio.nombre).toBe('Basta');
    });

    it('acepta precio 0 (PRD módulo 4: sin precio mínimo forzado)', () => {
      expect(Servicio.crear({ nombre: 'Retoque de garantía', precio: 0 }).precio.esCero).toBe(true);
    });

    it('rechaza nombre vacío con SERVICIO_NOMBRE_VACIO', () => {
      expect(() => Servicio.crear({ nombre: '   ', precio: 20 })).toThrow(
        expect.objectContaining({ codigo: 'SERVICIO_NOMBRE_VACIO' }),
      );
    });

    it('rechaza precio negativo con SERVICIO_PRECIO_INVALIDO (CHECK del Doc 4)', () => {
      expect(() => Servicio.crear({ nombre: 'Basta', precio: -1 })).toThrow(
        expect.objectContaining({ codigo: 'SERVICIO_PRECIO_INVALIDO' }),
      );
    });

    it('un precio con 3 decimales se rechaza como MONTO_INVALIDO, no se redondea', () => {
      expect(() => Servicio.crear({ nombre: 'Basta', precio: 20.555 })).toThrow(
        expect.objectContaining({ codigo: 'MONTO_INVALIDO' }),
      );
    });
  });

  describe('aplicar (PATCH: precio o activo)', () => {
    it('cambia el precio', () => {
      const servicio = persistido();

      expect(servicio.aplicar({ precio: 22 })).toBe(true);
      expect(servicio.precio.texto).toBe('22.00');
    });

    it('desactiva sin borrar (Doc 2, invariante 14)', () => {
      const servicio = persistido();

      expect(servicio.aplicar({ activo: false })).toBe(true);
      expect(servicio.activo).toBe(false);
    });

    it('devuelve false cuando nada cambia de verdad', () => {
      const servicio = persistido();

      expect(servicio.aplicar({})).toBe(false);
      expect(servicio.aplicar({ precio: 20, activo: true })).toBe(false);
      expect(servicio.aplicar({ precio: 20.0 })).toBe(false);
    });

    it('valida igual que al crear', () => {
      expect(() => persistido().aplicar({ precio: -5 })).toThrow(
        expect.objectContaining({ codigo: 'SERVICIO_PRECIO_INVALIDO' }),
      );
    });

    it('el nombre no es editable: un cambio de nombre no se aplica', () => {
      const servicio = persistido();

      // El DTO ni siquiera declara `nombre` (whitelist lo descarta antes);
      // esto fija la regla también a nivel de dominio.
      expect(servicio.aplicar({ nombre: 'Otro' } as never)).toBe(false);
      expect(servicio.nombre).toBe('Basta de jean');
    });
  });
});
