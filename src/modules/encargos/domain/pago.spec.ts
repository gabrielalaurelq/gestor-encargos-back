import { Nota } from './nota';
import { ObjetoRecibido } from './objeto-recibido';
import { Pago, TipoPago } from './pago';

const HOY = new Date(Date.UTC(2026, 9, 20));

describe('Pago (hijo del agregado, Doc 2)', () => {
  it('se crea con la fecha que le da el servidor, no el cliente', () => {
    const pago = Pago.crear({ monto: 100, origenId: 3, tipo: TipoPago.ADELANTO }, HOY);

    expect(pago.fecha).toEqual(HOY);
    expect(pago.monto.texto).toBe('100.00');
    expect(pago.tipo).toBe(TipoPago.ADELANTO);
    expect(pago.origenId).toBe(3);
  });

  it.each([
    ['cero', 0],
    ['negativo', -50],
  ])('rechaza un monto %s con PAGO_MONTO_INVALIDO (Doc 4, CHECK monto > 0)', (_caso, monto) => {
    expect(() => Pago.crear({ monto, origenId: 1, tipo: TipoPago.PAGO }, HOY)).toThrow(
      expect.objectContaining({ codigo: 'PAGO_MONTO_INVALIDO' }),
    );
  });

  it('un monto con 3 decimales → MONTO_INVALIDO', () => {
    expect(() => Pago.crear({ monto: 10.555, origenId: 1, tipo: TipoPago.PAGO }, HOY)).toThrow(
      expect.objectContaining({ codigo: 'MONTO_INVALIDO' }),
    );
  });

  it('no expone forma de editarse: un pago se borra y se vuelve a crear', () => {
    const pago = Pago.crear({ monto: 100, origenId: 1, tipo: TipoPago.PAGO }, HOY);

    expect('aplicar' in pago).toBe(false);
  });
});

describe('Nota (hijo del agregado, Doc 2)', () => {
  it('se crea con la fecha del servidor y el texto recortado', () => {
    const nota = Nota.crear({ texto: '  Llamar antes de entregar  ' }, HOY);

    expect(nota.texto).toBe('Llamar antes de entregar');
    expect(nota.fecha).toEqual(HOY);
  });

  it('rechaza texto vacío', () => {
    expect(() => Nota.crear({ texto: '   ' }, HOY)).toThrow(
      expect.objectContaining({ codigo: 'NOTA_TEXTO_VACIO' }),
    );
  });

  it('es inmutable: no expone métodos para cambiarla (invariante 16)', () => {
    const nota = Nota.crear({ texto: 'Algo' }, HOY);

    expect('aplicar' in nota).toBe(false);
  });
});

describe('ObjetoRecibido (hijo del agregado, Doc 2)', () => {
  it('recorta la descripción y rechaza la vacía', () => {
    expect(ObjetoRecibido.crear({ descripcion: '  Pantalón azul ' }).descripcion).toBe(
      'Pantalón azul',
    );
    expect(() => ObjetoRecibido.crear({ descripcion: ' ' })).toThrow(
      expect.objectContaining({ codigo: 'OBJETO_DESCRIPCION_VACIA' }),
    );
  });

  it('aplicar solo informa cambio si la descripción cambia de verdad', () => {
    const objeto = ObjetoRecibido.reconstituir({
      id: 'o1',
      descripcion: 'Pantalón azul',
      creadoEn: HOY,
      actualizadoEn: HOY,
    });

    expect(objeto.aplicar({})).toBe(false);
    expect(objeto.aplicar({ descripcion: '  Pantalón azul  ' })).toBe(false);
    expect(objeto.aplicar({ descripcion: 'Pantalón negro' })).toBe(true);
  });
});
