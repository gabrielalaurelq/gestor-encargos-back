import { escaparLike } from './escapar-like';

describe('escaparLike', () => {
  it('escapa los dos comodines de LIKE', () => {
    expect(escaparLike('50%')).toBe('50\\%');
    expect(escaparLike('cajón_3')).toBe('cajón\\_3');
  });

  it('escapa la barra invertida antes que nada (no escapa dos veces)', () => {
    expect(escaparLike('a\\%')).toBe('a\\\\\\%');
  });

  it('deja intacto el texto normal', () => {
    expect(escaparLike('Ana García +51')).toBe('Ana García +51');
  });
});
