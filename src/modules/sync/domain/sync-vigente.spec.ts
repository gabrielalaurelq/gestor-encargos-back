import { DIAS_RETENCION_TOMBSTONES } from '../../../shared/domain/retencion-tombstones';
import { syncVigente } from './sync-vigente';

const AHORA = new Date('2026-10-20T12:00:00.000Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000);

describe('syncVigente', () => {
  it('sin since (primera sync o resync completo) siempre vale', () => {
    expect(syncVigente({ since: null, ultimaSync: null, ahora: AHORA })).toBe(true);
  });

  it('since dentro del horizonte vale, aunque no se conozca la última sync', () => {
    expect(syncVigente({ since: hace(89), ultimaSync: null, ahora: AHORA })).toBe(true);
  });

  it('dispositivo abandonado: since y última sync por detrás del horizonte → no vale', () => {
    expect(syncVigente({ since: hace(120), ultimaSync: hace(120), ahora: AHORA })).toBe(false);
  });

  it('última sync desconocida con since viejo → no vale (ante la duda, resincronizar)', () => {
    expect(syncVigente({ since: hace(120), ultimaSync: null, ahora: AHORA })).toBe(false);
  });

  it('página 2 de un resync: since viejo (el corte) pero sync reciente → vale, sin bucle', () => {
    expect(syncVigente({ since: hace(400), ultimaSync: hace(0), ahora: AHORA })).toBe(true);
  });

  it('el borde exacto del horizonte todavía vale', () => {
    const borde = hace(DIAS_RETENCION_TOMBSTONES);

    expect(syncVigente({ since: borde, ultimaSync: null, ahora: AHORA })).toBe(true);
  });
});
