import { redactarAviso } from './redactar-aviso';
import { EncargoParaAviso, TipoAviso, evaluarAvisos } from './reglas-recordatorio';

const HOY = new Date('2026-10-20T00:00:00.000Z');
const dia = (offset: number) => new Date(HOY.getTime() + offset * 86_400_000);

function encargo(cambios: Partial<EncargoParaAviso> = {}): EncargoParaAviso {
  return {
    id: 'e1',
    numero: 12,
    descripcion: 'Vestido rojo',
    cliente: 'Ana García',
    estado: 'EN_PROCESO',
    fechaEntregaAcordada: dia(5),
    fechaListo: null,
    fechaEntregaReal: null,
    saldoCentimos: 0,
    ...cambios,
  };
}

const contexto = { hoy: HOY, diasNoRecoge: 2, incluirSaldos: false };
const tipos = (lista: EncargoParaAviso[], ctx = contexto) =>
  evaluarAvisos(lista, ctx).map((a) => a.tipo);

describe('evaluarAvisos (Doc 2 reglas 6-9, PRD 13)', () => {
  it('entrega hoy y mañana, sobre la fecha acordada', () => {
    expect(tipos([encargo({ fechaEntregaAcordada: dia(0) })])).toEqual([TipoAviso.ENTREGA_HOY]);
    expect(tipos([encargo({ fechaEntregaAcordada: dia(1) })])).toEqual([TipoAviso.ENTREGA_MANANA]);
    expect(tipos([encargo({ fechaEntregaAcordada: dia(2) })])).toEqual([]);
  });

  it('"entrega hoy" también para un LISTO: el cliente viene igual', () => {
    const listo = encargo({ estado: 'LISTO', fechaEntregaAcordada: dia(0), fechaListo: dia(0) });

    expect(tipos([listo])).toEqual([TipoAviso.ENTREGA_HOY]);
  });

  it('atrasado: acordada vencida y sin fecha_listo; deja de avisar al marcar LISTO', () => {
    expect(tipos([encargo({ fechaEntregaAcordada: dia(-1) })])).toEqual([TipoAviso.ATRASADO]);
    expect(
      tipos([encargo({ estado: 'LISTO', fechaEntregaAcordada: dia(-1), fechaListo: dia(-1) })]),
    ).not.toContain(TipoAviso.ATRASADO);
  });

  it('cliente no recoge: a partir de N días desde fecha_listo, con el N del negocio', () => {
    const listoHace = (n: number) =>
      encargo({ estado: 'LISTO', fechaEntregaAcordada: dia(10), fechaListo: dia(-n) });

    expect(tipos([listoHace(1)])).toEqual([]);
    expect(tipos([listoHace(2)])).toEqual([TipoAviso.NO_RECOGE]);
    expect(tipos([listoHace(3)], { ...contexto, diasNoRecoge: 5 })).toEqual([]);
  });

  it('PAUSADO no avisa de nada (decisión del usuario)', () => {
    const pausados = [
      encargo({ estado: 'PAUSADO', fechaEntregaAcordada: dia(0) }),
      encargo({ estado: 'PAUSADO', fechaEntregaAcordada: dia(-3) }),
      encargo({ estado: 'PAUSADO', fechaListo: dia(-9), fechaEntregaAcordada: dia(9) }),
    ];

    expect(tipos(pausados)).toEqual([]);
  });

  it('ENTREGADO y CANCELADO no avisan de entrega ni atraso', () => {
    expect(tipos([encargo({ estado: 'CANCELADO', fechaEntregaAcordada: dia(-3) })])).toEqual([]);
    expect(
      tipos([
        encargo({
          estado: 'ENTREGADO',
          fechaEntregaAcordada: dia(0),
          fechaListo: dia(-1),
          fechaEntregaReal: dia(0),
        }),
      ]),
    ).toEqual([]);
  });

  it('saldo pendiente: solo entregados con saldo > 0, y solo el día del resumen', () => {
    const debe = encargo({
      estado: 'ENTREGADO',
      fechaListo: dia(-5),
      fechaEntregaReal: dia(-5),
      saldoCentimos: 5000,
    });
    const aFavor = { ...debe, id: 'e2', saldoCentimos: -1000 };

    expect(tipos([debe, aFavor])).toEqual([]);
    expect(evaluarAvisos([debe, aFavor], { ...contexto, incluirSaldos: true })).toEqual([
      { tipo: TipoAviso.SALDO_PENDIENTE, encargos: [debe] },
    ]);
  });

  it('agrupa: varios del mismo tipo van en un solo aviso (regla 9)', () => {
    const avisos = evaluarAvisos(
      [
        encargo({ id: 'a', fechaEntregaAcordada: dia(-1) }),
        encargo({ id: 'b', fechaEntregaAcordada: dia(-4) }),
        encargo({ id: 'c', fechaEntregaAcordada: dia(0) }),
      ],
      contexto,
    );

    expect(avisos).toHaveLength(2);
    expect(avisos.find((a) => a.tipo === TipoAviso.ATRASADO)?.encargos.map((e) => e.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('redactarAviso', () => {
  it('uno solo: nombra el encargo y enlaza a él', () => {
    const mensaje = redactarAviso({ tipo: TipoAviso.ATRASADO, encargos: [encargo()] });

    expect(mensaje).toEqual({
      titulo: 'Trabajo atrasado',
      cuerpo: '#12 · Vestido rojo — Ana García',
      datos: { tipo: 'ATRASADO', encargo_id: 'e1' },
    });
  });

  it('varios: resumen sin enlace a un encargo concreto', () => {
    const mensaje = redactarAviso({
      tipo: TipoAviso.ATRASADO,
      encargos: [encargo(), encargo({ id: 'e2' }), encargo({ id: 'e3' })],
    });

    expect(mensaje).toEqual({
      titulo: 'Trabajo atrasado',
      cuerpo: 'Tienes 3 trabajos atrasados',
      datos: { tipo: 'ATRASADO' },
    });
  });

  it('sin número todavía (bloque Hi/Lo agotado offline) no muestra "#null"', () => {
    const mensaje = redactarAviso({
      tipo: TipoAviso.ENTREGA_HOY,
      encargos: [encargo({ numero: null })],
    });

    expect(mensaje.cuerpo).toBe('Vestido rojo — Ana García');
  });

  it('saldo: monto exacto en soles, uno y varios', () => {
    const uno = redactarAviso({
      tipo: TipoAviso.SALDO_PENDIENTE,
      encargos: [encargo({ saldoCentimos: 5050 })],
    });
    const varios = redactarAviso({
      tipo: TipoAviso.SALDO_PENDIENTE,
      encargos: [encargo({ saldoCentimos: 5050 }), encargo({ id: 'e2', saldoCentimos: 1000 })],
    });

    expect(uno.cuerpo).toBe('Ana García te debe S/50.50 (#12 · Vestido rojo — Ana García)');
    expect(varios.cuerpo).toBe('Te deben dinero de 2 encargos entregados: S/60.50 en total');
  });
});
