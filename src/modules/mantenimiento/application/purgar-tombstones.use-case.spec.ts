import { Logger } from '@nestjs/common';
import { DIAS_RETENCION_TOMBSTONES } from '../../../shared/domain/retencion-tombstones';
import { MantenimientoRepository } from './ports/mantenimiento.repository';
import { PurgarTombstonesUseCase } from './purgar-tombstones.use-case';

const AHORA = new Date('2026-10-20T08:00:00.000Z');
const conteo = (n: number) => ({ materiales: n, trabajos: n, objetos_recibidos: n, pagos: n });

describe('PurgarTombstonesUseCase', () => {
  let repositorio: jest.Mocked<MantenimientoRepository>;
  let useCase: PurgarTombstonesUseCase;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    repositorio = {
      listarNegocios: jest.fn().mockResolvedValue(['n1', 'n2', 'n3']),
      purgarTombstones: jest.fn().mockResolvedValue(conteo(1)),
      revertirPlanesVencidos: jest.fn(),
    } as unknown as jest.Mocked<MantenimientoRepository>;
    useCase = new PurgarTombstonesUseCase(repositorio);
  });

  afterEach(() => jest.restoreAllMocks());

  it('usa el mismo horizonte que /sync (DIAS_RETENCION_TOMBSTONES)', async () => {
    const { limite } = await useCase.execute(AHORA);

    const dias = (AHORA.getTime() - limite.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBe(DIAS_RETENCION_TOMBSTONES);
    expect(repositorio.purgarTombstones).toHaveBeenCalledWith('n1', limite);
  });

  it('recorre cada negocio por separado y suma los conteos', async () => {
    const resumen = await useCase.execute(AHORA);

    expect(repositorio.purgarTombstones).toHaveBeenCalledTimes(3);
    expect(resumen.borrados).toEqual(conteo(3));
  });

  it('un negocio que falla no detiene a los demás', async () => {
    repositorio.purgarTombstones.mockRejectedValueOnce(new Error('boom'));

    const resumen = await useCase.execute(AHORA);

    expect(resumen.fallidos).toEqual(['n1']);
    expect(resumen.borrados).toEqual(conteo(2));
  });
});
