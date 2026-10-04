import { MARGEN_SOLAPE_MS, calcularSiguienteSince } from './siguiente-since';

const INICIO = new Date('2026-10-04T22:24:05.000Z');

describe('calcularSiguienteSince', () => {
  it('sin truncamiento, retrocede el margen de solape', () => {
    const resultado = calcularSiguienteSince({ inicio: INICIO, corte: null });

    expect(resultado.hasMore).toBe(false);
    expect(resultado.servidorTimestamp.toISOString()).toBe('2026-10-04T22:23:55.000Z');
  });

  it('el margen cubre la ventana medida contra la base real', () => {
    // Caso comprobado con una sonda: escritura a las 22:24:04.003, commit a
    // las 22:24:06.013. Una sync a las 22:24:05 no ve la fila, así que la
    // marca que devuelve tiene que quedar por detrás de ese 22:24:04.003 para
    // que la próxima petición sí la traiga.
    const invisible = new Date('2026-10-04T22:24:04.003Z');

    const { servidorTimestamp } = calcularSiguienteSince({ inicio: INICIO, corte: null });

    expect(servidorTimestamp.getTime()).toBeLessThan(invisible.getTime());
  });

  it('el margen es mayor que el timeout de transacción de Prisma (5 s)', () => {
    expect(MARGEN_SOLAPE_MS).toBeGreaterThan(5_000);
  });

  it('con truncamiento, la marca no avanza más allá del corte', () => {
    const corte = new Date('2026-10-04T20:00:00.000Z');

    const resultado = calcularSiguienteSince({ inicio: INICIO, corte });

    expect(resultado.hasMore).toBe(true);
    expect(resultado.servidorTimestamp).toEqual(corte);
  });

  it('un corte posterior a la marca normal no la adelanta: el solape sigue protegiendo', () => {
    // Puede pasar si la colección truncada llega hasta el presente.
    const corteReciente = new Date('2026-10-04T22:24:04.900Z');

    const resultado = calcularSiguienteSince({ inicio: INICIO, corte: corteReciente });

    expect(resultado.hasMore).toBe(true);
    expect(resultado.servidorTimestamp.toISOString()).toBe('2026-10-04T22:23:55.000Z');
  });
});
