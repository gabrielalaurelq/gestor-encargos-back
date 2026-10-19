import { MontoInvalidoError } from '../../../shared/domain/monto';
import { MaterialCostoInvalidoError, MaterialNombreVacioError } from './errores';
import { Material } from './material';

const TRABAJO = '11111111-2222-3333-4444-555555555555';

describe('Material', () => {
  it('solo con nombre: cantidad y costo son opcionales (PRD 15)', () => {
    const material = Material.crear(TRABAJO, { nombre: '  Hilo rojo  ' });

    expect(material.nombre).toBe('Hilo rojo');
    expect(material.cantidad).toBeNull();
    expect(material.costo).toBeNull();
    expect(material.trabajoId).toBe(TRABAJO);
  });

  it('respeta el id del dispositivo', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    expect(Material.crear(TRABAJO, { id, nombre: 'Tela' }).id).toBe(id);
  });

  it('cantidad es texto libre; vacía equivale a no informarla', () => {
    expect(Material.crear(TRABAJO, { nombre: 'Tela', cantidad: ' 2 metros ' }).cantidad).toBe(
      '2 metros',
    );
    expect(Material.crear(TRABAJO, { nombre: 'Tela', cantidad: '   ' }).cantidad).toBeNull();
  });

  it('nombre vacío → MATERIAL_NOMBRE_VACIO', () => {
    expect(() => Material.crear(TRABAJO, { nombre: '   ' })).toThrow(MaterialNombreVacioError);
  });

  it('costo 0 vale; negativo → MATERIAL_COSTO_INVALIDO (CHECK del Doc 4)', () => {
    expect(Material.crear(TRABAJO, { nombre: 'Retazo', costo: 0 }).costo?.esCero).toBe(true);
    expect(() => Material.crear(TRABAJO, { nombre: 'Tela', costo: -1 })).toThrow(
      MaterialCostoInvalidoError,
    );
  });

  it('un tercer decimal se rechaza, no se redondea', () => {
    expect(() => Material.crear(TRABAJO, { nombre: 'Tela', costo: 1.234 })).toThrow(
      MontoInvalidoError,
    );
  });

  it('costo null explícito equivale a omitirlo', () => {
    expect(Material.crear(TRABAJO, { nombre: 'Tela', costo: null }).costo).toBeNull();
  });
});
