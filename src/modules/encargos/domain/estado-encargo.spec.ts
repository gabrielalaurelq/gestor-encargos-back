import { EstadoEncargo, esActivo, puedeTransicionar } from './estado-encargo';

const { INGRESADO, EN_PROCESO, LISTO, ENTREGADO, PAUSADO, CANCELADO } = EstadoEncargo;

describe('EstadoEncargo (máquina de estados, PRD módulo 6)', () => {
  it('el avance secuencial está permitido', () => {
    expect(puedeTransicionar(INGRESADO, EN_PROCESO)).toBe(true);
    expect(puedeTransicionar(EN_PROCESO, LISTO)).toBe(true);
    expect(puedeTransicionar(LISTO, ENTREGADO)).toBe(true);
  });

  it('saltarse estados está permitido (PRD: "un trabajo tan rápido que se entrega al toque")', () => {
    expect(puedeTransicionar(INGRESADO, ENTREGADO)).toBe(true);
    expect(puedeTransicionar(INGRESADO, LISTO)).toBe(true);
    expect(puedeTransicionar(EN_PROCESO, ENTREGADO)).toBe(true);
  });

  it('se puede pausar o cancelar desde cualquier estado activo (Doc 2, invariante 11)', () => {
    for (const desde of [INGRESADO, EN_PROCESO, LISTO]) {
      expect(puedeTransicionar(desde, PAUSADO)).toBe(true);
      expect(puedeTransicionar(desde, CANCELADO)).toBe(true);
    }
  });

  it('desde PAUSADO se reactiva a cualquier estado activo', () => {
    expect(puedeTransicionar(PAUSADO, EN_PROCESO)).toBe(true);
    expect(puedeTransicionar(PAUSADO, LISTO)).toBe(true);
    expect(puedeTransicionar(PAUSADO, INGRESADO)).toBe(true);
  });

  it('CANCELADO es reversible: fue un error (PRD módulo 6)', () => {
    expect(puedeTransicionar(CANCELADO, EN_PROCESO)).toBe(true);
    expect(puedeTransicionar(CANCELADO, INGRESADO)).toBe(true);
    expect(puedeTransicionar(CANCELADO, LISTO)).toBe(true);
    expect(puedeTransicionar(CANCELADO, PAUSADO)).toBe(true);
  });

  it('un cancelado no se puede entregar sin reactivarlo primero', () => {
    expect(puedeTransicionar(CANCELADO, ENTREGADO)).toBe(false);
  });

  it('ENTREGADO es terminal: no se pausa, ni se cancela, ni se deshace', () => {
    for (const hasta of [INGRESADO, EN_PROCESO, LISTO, PAUSADO, CANCELADO]) {
      expect(puedeTransicionar(ENTREGADO, hasta)).toBe(false);
    }
  });

  it('no se retrocede entre estados secuenciales de forma directa', () => {
    expect(puedeTransicionar(LISTO, EN_PROCESO)).toBe(false);
    expect(puedeTransicionar(EN_PROCESO, INGRESADO)).toBe(false);
  });

  it('esActivo distingue los estados que siguen vivos', () => {
    expect([INGRESADO, EN_PROCESO, LISTO, PAUSADO].every(esActivo)).toBe(true);
    // Doc 2, regla 10: estos dos dejan de contar en Balance de Carga y Calendario.
    expect(esActivo(ENTREGADO)).toBe(false);
    expect(esActivo(CANCELADO)).toBe(false);
  });
});
