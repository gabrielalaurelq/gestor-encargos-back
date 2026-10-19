import {
  FechaFueraDeRangoError,
  FechaInvalidaError,
  fechaDesdeIso,
  hoyEnZonaNegocio,
  isoDesdeFecha,
  resolverFechaDeHecho,
} from './fecha';

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

describe('resolverFechaDeHecho', () => {
  const AHORA = new Date('2026-10-15T17:00:00Z'); // mediodía en Lima

  it('sin fecha, usa el reloj del servidor en la zona del negocio', () => {
    expect(isoDesdeFecha(resolverFechaDeHecho(undefined, 'x', AHORA))).toBe('2026-10-15');
    expect(isoDesdeFecha(resolverFechaDeHecho(null, 'x', AHORA))).toBe('2026-10-15');
  });

  it('respeta la fecha del dispositivo: el caso de la cola Outbox', () => {
    // Pago hecho el lunes sin conexión, sincronizado el miércoles.
    expect(isoDesdeFecha(resolverFechaDeHecho('2026-10-12', 'fecha del pago', AHORA))).toBe(
      '2026-10-12',
    );
  });

  it('acepta hasta 1 día en el futuro (desfase de zona y de reloj)', () => {
    expect(isoDesdeFecha(resolverFechaDeHecho('2026-10-16', 'x', AHORA))).toBe('2026-10-16');
  });

  it('rechaza más allá de la tolerancia hacia el futuro', () => {
    expect(() => resolverFechaDeHecho('2026-10-17', 'fecha del pago', AHORA)).toThrow(
      FechaFueraDeRangoError,
    );
  });

  it('acepta el borde de la ventana hacia el pasado', () => {
    // 2026-10-15 menos 90 días.
    expect(isoDesdeFecha(resolverFechaDeHecho('2026-07-17', 'x', AHORA))).toBe('2026-07-17');
  });

  it('rechaza más allá de la ventana hacia el pasado', () => {
    expect(() => resolverFechaDeHecho('2026-07-16', 'fecha del pago', AHORA)).toThrow(
      expect.objectContaining({ codigo: 'FECHA_FUERA_DE_RANGO' }),
    );
  });

  it('el error dice qué rango se aceptaba', () => {
    expect(() => resolverFechaDeHecho('2020-01-01', 'fecha del pago', AHORA)).toThrow(
      expect.objectContaining({
        detalles: {
          'fecha del pago': '2020-01-01',
          rango_aceptado: { desde: '2026-07-17', hasta: '2026-10-16' },
        },
      }),
    );
  });

  it('una fecha mal formada sigue dando FECHA_INVALIDA, no fuera de rango', () => {
    expect(() => resolverFechaDeHecho('15/10/2026', 'fecha del pago', AHORA)).toThrow(
      expect.objectContaining({ codigo: 'FECHA_INVALIDA' }),
    );
  });

  it('la ventana se mide contra el calendario de Lima, no contra UTC', () => {
    // 2026-10-16 02:30 UTC = 2026-10-15 21:30 en Lima. "Hoy" es el 15, así
    // que el 16 entra por tolerancia y el 17 no.
    const madrugadaUtc = new Date('2026-10-16T02:30:00Z');

    expect(isoDesdeFecha(resolverFechaDeHecho('2026-10-16', 'x', madrugadaUtc))).toBe('2026-10-16');
    expect(() => resolverFechaDeHecho('2026-10-17', 'x', madrugadaUtc)).toThrow(
      FechaFueraDeRangoError,
    );
  });
});
