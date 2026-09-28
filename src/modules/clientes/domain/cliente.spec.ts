import { Cliente } from './cliente';
import { ClienteNombreVacioError } from './errores';

describe('Cliente (agregado, Doc 2)', () => {
  const marcas = { creadoEn: new Date('2026-09-01T10:00:00Z'), actualizadoEn: new Date() };

  describe('crear', () => {
    it('genera un UUID cuando el dispositivo no manda uno', () => {
      const cliente = Cliente.crear({ nombre: 'Ana' });

      expect(cliente.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('respeta el UUID generado en el dispositivo (Doc 3)', () => {
      const id = '11111111-2222-3333-4444-555555555555';

      expect(Cliente.crear({ id, nombre: 'Ana' }).id).toBe(id);
    });

    it('recorta el nombre', () => {
      expect(Cliente.crear({ nombre: '  Ana María  ' }).nombre).toBe('Ana María');
    });

    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      ['tabulaciones', '\t\n'],
    ])('rechaza un nombre %s con CLIENTE_NOMBRE_VACIO (Doc 5, 422)', (_caso, nombre) => {
      expect(() => Cliente.crear({ nombre })).toThrow(ClienteNombreVacioError);
      expect(() => Cliente.crear({ nombre })).toThrow(
        expect.objectContaining({ codigo: 'CLIENTE_NOMBRE_VACIO' }),
      );
    });

    it('el teléfono es opcional (Doc 2, invariante 18)', () => {
      expect(Cliente.crear({ nombre: 'Ana' }).telefono).toBeNull();
      expect(Cliente.crear({ nombre: 'Ana', telefono: null }).telefono).toBeNull();
      expect(Cliente.crear({ nombre: 'Ana', telefono: '+51987654321' })?.telefono?.valor).toBe(
        '+51987654321',
      );
    });
  });

  describe('aplicar (PATCH parcial)', () => {
    const base = () =>
      Cliente.reconstituir({
        id: 'a',
        nombre: 'Ana',
        telefono: '+51987654321',
        ...marcas,
      });

    it('un campo ausente no se toca', () => {
      const cliente = base();

      expect(cliente.aplicar({ nombre: 'Ana María' })).toBe(true);
      expect(cliente.nombre).toBe('Ana María');
      expect(cliente.telefono?.valor).toBe('+51987654321');
    });

    it('telefono: null borra el teléfono', () => {
      const cliente = base();

      expect(cliente.aplicar({ telefono: null })).toBe(true);
      expect(cliente.telefono).toBeNull();
    });

    it('devuelve false cuando nada cambia de verdad (no toca actualizado_en)', () => {
      const cliente = base();

      expect(cliente.aplicar({})).toBe(false);
      expect(cliente.aplicar({ nombre: 'Ana', telefono: '+51987654321' })).toBe(false);
      // Un nombre que solo difiere en espacios tampoco es un cambio real.
      expect(cliente.aplicar({ nombre: '  Ana  ' })).toBe(false);
    });

    it('valida igual que al crear', () => {
      expect(() => base().aplicar({ nombre: ' ' })).toThrow(ClienteNombreVacioError);
      expect(() => base().aplicar({ telefono: '987654321' })).toThrow(
        expect.objectContaining({ codigo: 'TELEFONO_INVALIDO' }),
      );
    });
  });
});
