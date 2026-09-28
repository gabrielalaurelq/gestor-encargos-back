import { TelefonoInvalidoError } from './errores';
import { Telefono } from './telefono';

describe('Telefono (Value Object, Doc 2)', () => {
  it('acepta un número peruano en E.164', () => {
    expect(Telefono.crear('+51987654321').valor).toBe('+51987654321');
  });

  it('acepta números internacionales de otras longitudes', () => {
    expect(Telefono.crear('+14155552671').valor).toBe('+14155552671');
    expect(Telefono.crear('+442071838750').valor).toBe('+442071838750');
  });

  it('recorta espacios alrededor', () => {
    expect(Telefono.crear('  +51987654321 ').valor).toBe('+51987654321');
  });

  it.each([
    ['sin el +', '51987654321'],
    ['solo dígitos nacionales', '987654321'],
    ['con separadores', '+51 987 654 321'],
    ['con guiones', '+51-987-654-321'],
    ['código de país que empieza en 0', '+0987654321'],
    ['demasiado corto', '+51987'],
    ['demasiado largo (16 dígitos)', '+5198765432112345'],
    ['con letras', '+51987ABC321'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, valor) => {
    expect(() => Telefono.crear(valor)).toThrow(TelefonoInvalidoError);
  });

  it('el error lleva el código del catálogo y el valor recibido', () => {
    expect.assertions(2);
    try {
      Telefono.crear('987654321');
    } catch (error) {
      expect((error as TelefonoInvalidoError).codigo).toBe('TELEFONO_INVALIDO');
      expect((error as TelefonoInvalidoError).detalles).toEqual({
        telefono_recibido: '987654321',
      });
    }
  });

  describe('crearOpcional', () => {
    it.each([null, undefined, '', '   '])('devuelve null para %p', (valor) => {
      expect(Telefono.crearOpcional(valor)).toBeNull();
    });

    it('valida igual cuando sí hay valor', () => {
      expect(() => Telefono.crearOpcional('987654321')).toThrow(TelefonoInvalidoError);
    });
  });

  it('igualdad por valor, no por identidad', () => {
    const uno = Telefono.crear('+51987654321');
    const otro = Telefono.crear('+51987654321');

    expect(uno).not.toBe(otro);
    expect(uno.equals(otro)).toBe(true);
    expect(uno.equals(Telefono.crear('+51999888777'))).toBe(false);
    expect(uno.equals(null)).toBe(false);
  });

  it('expone los dígitos sin + para el deep link de WhatsApp (Doc 10)', () => {
    expect(Telefono.crear('+51987654321').digitos).toBe('51987654321');
  });
});
