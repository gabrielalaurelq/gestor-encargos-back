import { Logger } from '@nestjs/common';
import { Notificador } from '../../../shared/application/notificador';
import { EncargoParaAviso } from '../domain/reglas-recordatorio';
import { EvaluarRecordatoriosUseCase } from './evaluar-recordatorios.use-case';
import { RecordatoriosRepository } from './ports/recordatorios.repository';

// Martes 20/10/2026, 9:00 de Lima (14:00 UTC).
const MARTES = new Date('2026-10-20T14:00:00.000Z');
const LUNES = new Date('2026-10-19T14:00:00.000Z');

function encargo(cambios: Partial<EncargoParaAviso>): EncargoParaAviso {
  return {
    id: 'e1',
    numero: 1,
    descripcion: 'Basta',
    cliente: 'Ana',
    estado: 'EN_PROCESO',
    fechaEntregaAcordada: new Date('2026-10-20T00:00:00.000Z'),
    fechaListo: null,
    fechaEntregaReal: null,
    saldoCentimos: 0,
    ...cambios,
  };
}

describe('EvaluarRecordatoriosUseCase', () => {
  let repositorio: jest.Mocked<RecordatoriosRepository>;
  let notificador: jest.Mocked<Notificador>;
  let useCase: EvaluarRecordatoriosUseCase;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    repositorio = {
      listarNegocios: jest.fn().mockResolvedValue([{ id: 'n1', diasAvisoNoRecoge: 2 }]),
      datosParaAvisos: jest.fn(),
      soltarTokens: jest.fn(),
    } as unknown as jest.Mocked<RecordatoriosRepository>;
    notificador = {
      enviar: jest.fn().mockResolvedValue({ enviados: 1, tokensInvalidos: [] }),
    } as unknown as jest.Mocked<Notificador>;
    useCase = new EvaluarRecordatoriosUseCase(repositorio, notificador);
  });

  afterEach(() => jest.restoreAllMocks());

  it('"hoy" es el de Lima: a las 9:00 de Lima avisa "entrega hoy" del 20', async () => {
    repositorio.datosParaAvisos.mockResolvedValue({ tokens: ['t1'], encargos: [encargo({})] });

    await useCase.execute(MARTES);

    expect(notificador.enviar).toHaveBeenCalledWith(
      ['t1'],
      expect.objectContaining({ titulo: 'Entrega hoy' }),
    );
  });

  it('sin tokens no se envía nada', async () => {
    repositorio.datosParaAvisos.mockResolvedValue({ tokens: [], encargos: [encargo({})] });

    await useCase.execute(MARTES);

    expect(notificador.enviar).not.toHaveBeenCalled();
  });

  it('suelta los tokens inválidos y no los reintenta en el siguiente aviso', async () => {
    repositorio.datosParaAvisos.mockResolvedValue({
      tokens: ['vivo', 'muerto'],
      encargos: [
        encargo({ id: 'a' }),
        encargo({ id: 'b', fechaEntregaAcordada: new Date('2026-10-18T00:00:00.000Z') }),
      ],
    });
    notificador.enviar.mockResolvedValueOnce({ enviados: 1, tokensInvalidos: ['muerto'] });

    const resumen = await useCase.execute(MARTES);

    expect(notificador.enviar).toHaveBeenCalledTimes(2);
    expect(notificador.enviar.mock.calls[1][0]).toEqual(['vivo']);
    expect(repositorio.soltarTokens).toHaveBeenCalledWith('n1', ['muerto']);
    expect(resumen.tokensSoltados).toBe(1);
  });

  it('el resumen de saldos solo sale los lunes', async () => {
    const debe = encargo({
      estado: 'ENTREGADO',
      fechaListo: new Date('2026-10-01T00:00:00.000Z'),
      fechaEntregaReal: new Date('2026-10-01T00:00:00.000Z'),
      saldoCentimos: 1000,
    });
    repositorio.datosParaAvisos.mockResolvedValue({ tokens: ['t1'], encargos: [debe] });

    await useCase.execute(MARTES);
    expect(notificador.enviar).not.toHaveBeenCalled();

    await useCase.execute(LUNES);
    expect(notificador.enviar).toHaveBeenCalledWith(
      ['t1'],
      expect.objectContaining({ titulo: 'Saldo pendiente' }),
    );
  });

  it('un negocio que falla no detiene a los demás', async () => {
    repositorio.listarNegocios.mockResolvedValue([
      { id: 'n1', diasAvisoNoRecoge: 2 },
      { id: 'n2', diasAvisoNoRecoge: 2 },
    ]);
    repositorio.datosParaAvisos
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ tokens: ['t2'], encargos: [encargo({})] });

    const resumen = await useCase.execute(MARTES);

    expect(resumen.fallidos).toEqual(['n1']);
    expect(notificador.enviar).toHaveBeenCalledWith(['t2'], expect.anything());
  });
});
