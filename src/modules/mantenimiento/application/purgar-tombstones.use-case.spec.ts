import { Logger } from '@nestjs/common';
import { AlmacenamientoFotos } from '../../../shared/application/almacenamiento-fotos';
import { DIAS_RETENCION_TOMBSTONES } from '../../../shared/domain/retencion-tombstones';
import { MantenimientoRepository } from './ports/mantenimiento.repository';
import { PurgarTombstonesUseCase } from './purgar-tombstones.use-case';

const AHORA = new Date('2026-10-20T08:00:00.000Z');
const conteo = (n: number) => ({
  fotos: n,
  materiales: n,
  trabajos: n,
  objetos_recibidos: n,
  pagos: n,
});

describe('PurgarTombstonesUseCase', () => {
  let repositorio: jest.Mocked<MantenimientoRepository>;
  let almacenamiento: jest.Mocked<AlmacenamientoFotos>;
  let useCase: PurgarTombstonesUseCase;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    repositorio = {
      listarNegocios: jest.fn().mockResolvedValue(['n1', 'n2', 'n3']),
      fotosPorPurgar: jest.fn().mockResolvedValue([]),
      purgarTombstones: jest.fn().mockResolvedValue(conteo(1)),
      revertirPlanesVencidos: jest.fn(),
    } as unknown as jest.Mocked<MantenimientoRepository>;
    almacenamiento = {
      eliminar: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AlmacenamientoFotos>;
    useCase = new PurgarTombstonesUseCase(repositorio, almacenamiento);
  });

  afterEach(() => jest.restoreAllMocks());

  it('usa el mismo horizonte que /sync (DIAS_RETENCION_TOMBSTONES)', async () => {
    const { limite } = await useCase.execute(AHORA);

    const dias = (AHORA.getTime() - limite.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBe(DIAS_RETENCION_TOMBSTONES);
    expect(repositorio.purgarTombstones).toHaveBeenCalledWith('n1', limite, []);
  });

  it('recorre cada negocio por separado y suma los conteos', async () => {
    const resumen = await useCase.execute(AHORA);

    expect(repositorio.purgarTombstones).toHaveBeenCalledTimes(3);
    expect(resumen.borrados).toEqual(conteo(3));
  });

  it('borra en R2 antes que en la base, y solo las filas cuyos archivos borró', async () => {
    repositorio.listarNegocios.mockResolvedValue(['n1']);
    repositorio.fotosPorPurgar.mockResolvedValue([{ id: 'f1', clave: 'negocios/n1/f1.jpg' }]);
    const orden: string[] = [];
    almacenamiento.eliminar.mockImplementation(async () => void orden.push('r2'));
    repositorio.purgarTombstones.mockImplementation(async () => {
      orden.push('base');
      return conteo(1);
    });

    await useCase.execute(AHORA);

    expect(almacenamiento.eliminar).toHaveBeenCalledWith(['negocios/n1/f1.jpg']);
    expect(repositorio.purgarTombstones).toHaveBeenCalledWith('n1', expect.any(Date), ['f1']);
    expect(orden).toEqual(['r2', 'base']);
  });

  it('si R2 falla, no se toca la base de ese negocio (no quedan archivos huérfanos)', async () => {
    almacenamiento.eliminar.mockRejectedValueOnce(new Error('R2 caído'));

    const resumen = await useCase.execute(AHORA);

    expect(resumen.fallidos).toEqual(['n1']);
    expect(repositorio.purgarTombstones).not.toHaveBeenCalledWith('n1', expect.anything(), []);
    expect(repositorio.purgarTombstones).toHaveBeenCalledTimes(2);
  });

  it('un negocio que falla no detiene a los demás', async () => {
    repositorio.purgarTombstones.mockRejectedValueOnce(new Error('boom'));

    const resumen = await useCase.execute(AHORA);

    expect(resumen.fallidos).toEqual(['n1']);
    expect(resumen.borrados).toEqual(conteo(2));
  });
});
