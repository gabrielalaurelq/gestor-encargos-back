import { inyectarNegocio, MODELOS_CON_NEGOCIO, NegocioAjenoError } from './filtro-negocio';

const NEGOCIO = 'negocio-A';

describe('MODELOS_CON_NEGOCIO', () => {
  it('lista exactamente los modelos con negocio_id del Doc 4 (10) y excluye Negocio y OrigenPago', () => {
    expect([...MODELOS_CON_NEGOCIO].sort()).toEqual([
      'Cliente',
      'Dispositivo',
      'Encargo',
      'Foto',
      'Material',
      'Nota',
      'ObjetoRecibido',
      'Pago',
      'Servicio',
      'Trabajo',
    ]);
  });
});

describe('inyectarNegocio', () => {
  it('no toca los modelos sin negocio_id', () => {
    const args = { where: { googleUid: 'x' } };

    expect(inyectarNegocio('Negocio', 'findUnique', args, NEGOCIO)).toEqual(args);
    expect(inyectarNegocio('OrigenPago', 'findMany', undefined, NEGOCIO)).toEqual({});
  });

  it.each([
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
    'updateMany',
    'deleteMany',
    'update',
    'delete',
  ])('%s: agrega negocioId al where conservando los filtros previos', (operacion) => {
    const resultado = inyectarNegocio(
      'Cliente',
      operacion,
      { where: { OR: [{ nombre: 'Ana' }, { telefono: '1' }] } },
      NEGOCIO,
    );

    expect(resultado.where).toEqual({
      OR: [{ nombre: 'Ana' }, { telefono: '1' }],
      negocioId: NEGOCIO,
    });
  });

  it('findMany sin where recibe un where con solo negocioId', () => {
    expect(inyectarNegocio('Encargo', 'findMany', undefined, NEGOCIO)).toEqual({
      where: { negocioId: NEGOCIO },
    });
  });

  it('create: inyecta negocioId en data', () => {
    const resultado = inyectarNegocio('Cliente', 'create', { data: { nombre: 'Ana' } }, NEGOCIO);

    expect(resultado.data).toEqual({ nombre: 'Ana', negocioId: NEGOCIO });
  });

  it('createMany: inyecta negocioId en cada fila', () => {
    const resultado = inyectarNegocio(
      'Servicio',
      'createMany',
      {
        data: [
          { nombre: 'Basta', precio: 5 },
          { nombre: 'Cierre', precio: 8 },
        ],
      },
      NEGOCIO,
    );

    expect(resultado.data).toEqual([
      { nombre: 'Basta', precio: 5, negocioId: NEGOCIO },
      { nombre: 'Cierre', precio: 8, negocioId: NEGOCIO },
    ]);
  });

  it('upsert: filtra el where e inyecta en create, sin tocar update', () => {
    const resultado = inyectarNegocio(
      'Servicio',
      'upsert',
      { where: { id: 's1' }, create: { nombre: 'Basta', precio: 5 }, update: { precio: 6 } },
      NEGOCIO,
    );

    expect(resultado).toEqual({
      where: { id: 's1', negocioId: NEGOCIO },
      create: { nombre: 'Basta', precio: 5, negocioId: NEGOCIO },
      update: { precio: 6 },
    });
  });

  it('acepta un negocioId explícito si coincide con el de la sesión', () => {
    expect(() =>
      inyectarNegocio(
        'Cliente',
        'create',
        { data: { nombre: 'Ana', negocioId: NEGOCIO } },
        NEGOCIO,
      ),
    ).not.toThrow();
  });

  describe('falla en voz alta ante un negocioId ajeno (bug en un caso de uso)', () => {
    it('en el where de una lectura', () => {
      expect(() =>
        inyectarNegocio('Cliente', 'findMany', { where: { negocioId: 'otro' } }, NEGOCIO),
      ).toThrow(NegocioAjenoError);
    });

    it('en data de create', () => {
      expect(() =>
        inyectarNegocio(
          'Cliente',
          'create',
          { data: { nombre: 'Ana', negocioId: 'otro' } },
          NEGOCIO,
        ),
      ).toThrow(NegocioAjenoError);
    });

    it('al intentar reasignar una fila con update', () => {
      expect(() =>
        inyectarNegocio(
          'Cliente',
          'update',
          { where: { id: 'c1' }, data: { negocioId: 'otro' } },
          NEGOCIO,
        ),
      ).toThrow(NegocioAjenoError);
    });
  });
});
