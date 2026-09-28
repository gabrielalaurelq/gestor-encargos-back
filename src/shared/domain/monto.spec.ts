import { Monto, MontoInvalidoError } from './monto';

describe('Monto (Value Object, Doc 2)', () => {
  describe('desde', () => {
    it.each([
      [20, 2000],
      ['20', 2000],
      [20.5, 2050],
      ['20.50', 2050],
      [20.05, 2005],
      ['20.5', 2050],
      [0, 0],
      ['0.00', 0],
      [-15.75, -1575],
      ['99999999.99', 9999999999],
    ])('%p → %i céntimos', (valor, centimos) => {
      expect(Monto.desde(valor).centimos).toBe(centimos);
    });

    it('rechaza un tercer decimal en vez de redondearlo', () => {
      expect(() => Monto.desde(20.555)).toThrow(MontoInvalidoError);
      expect(() => Monto.desde('20.555')).toThrow(MontoInvalidoError);
    });

    it.each([
      ['no numérico', 'veinte'],
      ['vacío', ''],
      ['con moneda', 'S/ 20'],
      ['con separador de miles', '1,000.00'],
      ['más de 8 dígitos enteros', '100000000'],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['notación exponencial', 1e-7],
    ])('rechaza %s', (_caso, valor) => {
      expect(() => Monto.desde(valor as number | string)).toThrow(MontoInvalidoError);
    });

    it('el error lleva el código y el valor recibido', () => {
      expect(() => Monto.desde('abc')).toThrow(
        expect.objectContaining({
          codigo: 'MONTO_INVALIDO',
          detalles: { monto_recibido: 'abc' },
        }),
      );
    });
  });

  it('aritmética exacta: donde un float fallaría', () => {
    // 0.1 + 0.2 === 0.30000000000000004 en coma flotante binaria.
    const suma = Monto.desde(0.1).sumar(Monto.desde(0.2));

    expect(suma.centimos).toBe(30);
    expect(suma.soles).toBe(0.3);
    expect(suma.equals(Monto.desde(0.3))).toBe(true);
  });

  it('suma y resta encadenadas no acumulan error', () => {
    const total = Array.from({ length: 100 }, () => Monto.desde(0.07)).reduce(
      (acumulado, monto) => acumulado.sumar(monto),
      Monto.CERO,
    );

    expect(total.texto).toBe('7.00');
  });

  it('permite resultados negativos (saldo a favor del cliente, Doc 2)', () => {
    const saldo = Monto.desde(50).restar(Monto.desde(80));

    expect(saldo.centimos).toBe(-3000);
    expect(saldo.esNegativo).toBe(true);
    expect(saldo.texto).toBe('-30.00');
  });

  it('texto siempre trae 2 decimales, como DECIMAL(10,2)', () => {
    expect(Monto.desde(20).texto).toBe('20.00');
    expect(Monto.desde(20.5).texto).toBe('20.50');
    expect(Monto.CERO.texto).toBe('0.00');
  });

  it('igualdad por valor y comparación', () => {
    expect(Monto.desde(20).equals(Monto.desde('20.00'))).toBe(true);
    expect(Monto.desde(20).equals(Monto.desde(20.01))).toBe(false);
    expect(Monto.desde(20).equals(null)).toBe(false);
    expect(Monto.desde(20.01).mayorQue(Monto.desde(20))).toBe(true);
    expect(Monto.desde(20).mayorQue(Monto.desde(20))).toBe(false);
  });

  it('desdeCentimos exige un entero', () => {
    expect(Monto.desdeCentimos(2050).texto).toBe('20.50');
    expect(() => Monto.desdeCentimos(20.5)).toThrow(MontoInvalidoError);
  });

  it('se muestra en soles', () => {
    expect(String(Monto.desde(20.5))).toBe('S/ 20.50');
  });
});
