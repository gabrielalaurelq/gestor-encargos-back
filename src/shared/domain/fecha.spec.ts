import { FechaInvalidaError, fechaDesdeIso, hoyEnZonaNegocio, isoDesdeFecha } from './fecha';

describe('fecha', () => {
  describe('fechaDesdeIso', () => {
    it('devuelve medianoche UTC del día indicado', () => {
      expect(fechaDesdeIso('2026-10-15', 'x').toISOString()).toBe('2026-10-15T00:00:00.000Z');
    });

    it('recorta espacios', () => {
      expect(isoDesdeFecha(fechaDesdeIso(' 2026-10-15 ', 'x'))).toBe('2026-10-15');
    });

    it.each([
      ['formato con barras', '15/10/2026'],
      ['con hora', '2026-10-15T00:00:00Z'],
      ['mes de un dígito', '2026-1-15'],
      ['texto', 'mañana'],
      ['vacío', ''],
    ])('rechaza %s', (_caso, valor) => {
      expect(() => fechaDesdeIso(valor, 'entrega')).toThrow(FechaInvalidaError);
    });

    it.each([
      ['día 31 en un mes de 30', '2026-04-31'],
      ['29 de febrero en año no bisiesto', '2026-02-29'],
      ['mes 13', '2026-13-01'],
      ['día 00', '2026-10-00'],
    ])('rechaza una fecha imposible: %s', (_caso, valor) => {
      expect(() => fechaDesdeIso(valor, 'entrega')).toThrow(FechaInvalidaError);
    });

    it('acepta el 29 de febrero en año bisiesto', () => {
      expect(isoDesdeFecha(fechaDesdeIso('2028-02-29', 'x'))).toBe('2028-02-29');
    });

    it('el error nombra el campo', () => {
      expect(() => fechaDesdeIso('ayer', 'entrega acordada')).toThrow(
        expect.objectContaining({
          codigo: 'FECHA_INVALIDA',
          detalles: { 'entrega acordada': 'ayer' },
        }),
      );
    });
  });

  describe('hoyEnZonaNegocio', () => {
    it('usa el calendario de Lima, no el del servidor en UTC', () => {
      // 2026-10-16 02:30 UTC = 2026-10-15 21:30 en Lima (UTC-5). Con el reloj
      // UTC el encargo quedaría fechado un día después del real.
      const madrugadaUtc = new Date('2026-10-16T02:30:00Z');

      expect(isoDesdeFecha(hoyEnZonaNegocio(madrugadaUtc))).toBe('2026-10-15');
    });

    it('a mediodía de Lima coincide con la fecha UTC', () => {
      expect(isoDesdeFecha(hoyEnZonaNegocio(new Date('2026-10-15T17:00:00Z')))).toBe('2026-10-15');
    });

    it('devuelve medianoche UTC, comparable con las columnas DATE', () => {
      expect(hoyEnZonaNegocio().toISOString()).toMatch(/T00:00:00\.000Z$/);
    });
  });
});
