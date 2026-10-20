import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Monto } from '../../../shared/domain/monto';
import { isoDesdeFecha } from '../../../shared/domain/fecha';
import {
  PrismaNegocio,
  TransaccionNegocio,
} from '../../../shared/infrastructure/prisma/prisma-negocio';
import {
  CambiosSync,
  FilaSync,
  ResultadoCambios,
  SyncRepository,
} from '../application/ports/sync.repository';

/** Timestamp completo; `null` se conserva como `null`. */
function marca(valor: Date | null): string | null {
  return valor === null ? null : valor.toISOString();
}

/** Columnas `DATE` sin hora (Doc 4): salen como AAAA-MM-DD. */
function fecha(valor: Date | null): string | null {
  return valor === null ? null : isoDesdeFecha(valor);
}

/** Dinero: número con 2 decimales, igual que en el resto de la API. */
function dinero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Monto.desde(valor.toString()).soles;
}

@Injectable()
export class PrismaSyncRepository extends SyncRepository {
  constructor(private readonly prisma: PrismaNegocio) {
    super();
  }

  async ultimaSync(dispositivoId: string): Promise<Date | null> {
    const fila = await this.prisma.transaccion((tx) =>
      tx.dispositivo.findUnique({ where: { id: dispositivoId }, select: { ultimaSyncEn: true } }),
    );
    return fila?.ultimaSyncEn ?? null;
  }

  async registrarSync(dispositivoId: string, cuando: Date): Promise<void> {
    // `updateMany` y no `update`: si la sesión se cerró, la fila no existe y
    // no hay nada que marcar — no es motivo para fallar la sincronización.
    await this.prisma.transaccion((tx) =>
      tx.dispositivo.updateMany({ where: { id: dispositivoId }, data: { ultimaSyncEn: cuando } }),
    );
  }

  async cambiosDesde(since: Date | null, limite: number): Promise<ResultadoCambios> {
    // `since` es inclusivo (`gte`): si fuera exclusivo, una fila con
    // exactamente la marca del corte se saltaría al paginar. Reenviarla es
    // inofensivo con LWW; saltarla, no.
    const desde: Prisma.DateTimeFilter | undefined = since ? { gte: since } : undefined;
    const where = desde ? { actualizadoEn: desde } : {};

    // Se pide una fila más que el límite: si llega, hubo truncamiento.
    const comun = {
      where,
      orderBy: { actualizadoEn: 'asc' },
      take: limite + 1,
    } as const;

    // Una sola foto para las 9 consultas. Con el aislamiento por defecto cada
    // sentencia vería un estado distinto y el cliente podría recibir un trabajo
    // cuyo encargo no venía en la consulta anterior: un hijo sin padre.
    const filas = await this.prisma.transaccion(
      async (tx: TransaccionNegocio) =>
        Promise.all([
          tx.cliente.findMany(comun),
          tx.servicio.findMany(comun),
          tx.encargo.findMany(comun),
          // Los tombstones NO se filtran: el cliente los necesita para borrar
          // en local (Doc 4, Bloque 3 / Doc 5, Bloque 1).
          tx.objetoRecibido.findMany(comun),
          tx.trabajo.findMany(comun),
          tx.material.findMany(comun),
          tx.pago.findMany(comun),
          tx.nota.findMany(comun),
          tx.foto.findMany(comun),
        ]),
      { aislamiento: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const cortes: Date[] = [];

    /** Recorta al límite y, si sobraba, apunta el corte de esa colección. */
    const recortar = <T extends { actualizadoEn: Date }>(coleccion: T[]): T[] => {
      if (coleccion.length <= limite) {
        return coleccion;
      }
      const recortada = coleccion.slice(0, limite);
      cortes.push(recortada[recortada.length - 1].actualizadoEn);
      return recortada;
    };

    const [clientes, servicios, encargos, objetos, trabajos, materiales, pagos, notas, fotos] =
      filas;

    const cambios: CambiosSync = {
      clientes: recortar(clientes).map(PrismaSyncRepository.cliente),
      servicios: recortar(servicios).map(PrismaSyncRepository.servicio),
      encargos: recortar(encargos).map(PrismaSyncRepository.encargo),
      objetos_recibidos: recortar(objetos).map(PrismaSyncRepository.objeto),
      trabajos: recortar(trabajos).map(PrismaSyncRepository.trabajo),
      materiales: recortar(materiales).map(PrismaSyncRepository.material),
      pagos: recortar(pagos).map(PrismaSyncRepository.pago),
      notas: recortar(notas).map(PrismaSyncRepository.nota),
      fotos: recortar(fotos).map(PrismaSyncRepository.foto),
    };

    // El corte más antiguo manda: las colecciones completas se reenviarán en
    // parte la próxima vez, que con LWW no cuesta nada.
    const corte =
      cortes.length === 0 ? null : new Date(Math.min(...cortes.map((c) => c.getTime())));

    return { cambios, corte };
  }

  // --- Proyecciones -------------------------------------------------------
  // Son distintas de las respuestas REST a propósito: ahí las claves padre van
  // en la URL, acá el cliente recibe listas planas y necesita las llaves
  // foráneas para reconstruir las relaciones en su base local.
  //
  // `eliminado_en` solo aparece en las cinco tablas que lo tienen (Doc 4,
  // Bloque 3): clientes, servicios, encargos y notas no se borran.

  private static cliente(fila: {
    id: string;
    nombre: string;
    telefono: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
  }): FilaSync {
    return {
      id: fila.id,
      nombre: fila.nombre,
      telefono: fila.telefono,
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
    };
  }

  private static servicio(fila: {
    id: string;
    nombre: string;
    precio: Prisma.Decimal;
    activo: boolean;
    creadoEn: Date;
    actualizadoEn: Date;
  }): FilaSync {
    return {
      id: fila.id,
      nombre: fila.nombre,
      precio: dinero(fila.precio),
      activo: fila.activo,
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
    };
  }

  private static encargo(fila: {
    id: string;
    clienteId: string;
    numero: number | null;
    descripcion: string;
    estado: string;
    precioTotal: Prisma.Decimal;
    descuento: Prisma.Decimal;
    saldoPendiente: Prisma.Decimal;
    ubicacionFisica: string | null;
    notasGenerales: string | null;
    fechaEntregaPrometida: Date;
    fechaEntregaAcordada: Date;
    fechaListo: Date | null;
    fechaEntregaReal: Date | null;
    creadoEn: Date;
    actualizadoEn: Date;
  }): FilaSync {
    return {
      id: fila.id,
      cliente_id: fila.clienteId,
      numero: fila.numero,
      descripcion: fila.descripcion,
      estado: fila.estado,
      precio_total: dinero(fila.precioTotal),
      descuento: dinero(fila.descuento),
      saldo_pendiente: dinero(fila.saldoPendiente),
      ubicacion_fisica: fila.ubicacionFisica,
      notas_generales: fila.notasGenerales,
      fecha_entrega_prometida: fecha(fila.fechaEntregaPrometida),
      fecha_entrega_acordada: fecha(fila.fechaEntregaAcordada),
      fecha_listo: fecha(fila.fechaListo),
      fecha_entrega_real: fecha(fila.fechaEntregaReal),
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
    };
  }

  private static objeto(fila: {
    id: string;
    encargoId: string;
    descripcion: string;
    creadoEn: Date;
    actualizadoEn: Date;
    eliminadoEn: Date | null;
  }): FilaSync {
    return {
      id: fila.id,
      encargo_id: fila.encargoId,
      descripcion: fila.descripcion,
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
      eliminado_en: marca(fila.eliminadoEn),
    };
  }

  private static trabajo(fila: {
    id: string;
    encargoId: string;
    servicioId: string | null;
    objetoRecibidoId: string | null;
    descripcion: string;
    precio: Prisma.Decimal;
    creadoEn: Date;
    actualizadoEn: Date;
    eliminadoEn: Date | null;
  }): FilaSync {
    return {
      id: fila.id,
      encargo_id: fila.encargoId,
      servicio_id: fila.servicioId,
      objeto_recibido_id: fila.objetoRecibidoId,
      descripcion: fila.descripcion,
      precio: dinero(fila.precio),
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
      eliminado_en: marca(fila.eliminadoEn),
    };
  }

  private static material(fila: {
    id: string;
    trabajoId: string;
    nombre: string;
    cantidad: string | null;
    costo: Prisma.Decimal | null;
    creadoEn: Date;
    actualizadoEn: Date;
    eliminadoEn: Date | null;
  }): FilaSync {
    return {
      id: fila.id,
      trabajo_id: fila.trabajoId,
      nombre: fila.nombre,
      cantidad: fila.cantidad,
      costo: dinero(fila.costo),
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
      eliminado_en: marca(fila.eliminadoEn),
    };
  }

  private static pago(fila: {
    id: string;
    encargoId: string;
    monto: Prisma.Decimal;
    origenId: number;
    tipo: string;
    fecha: Date;
    creadoEn: Date;
    actualizadoEn: Date;
    eliminadoEn: Date | null;
  }): FilaSync {
    return {
      id: fila.id,
      encargo_id: fila.encargoId,
      monto: dinero(fila.monto),
      origen_id: fila.origenId,
      tipo: fila.tipo,
      fecha: fecha(fila.fecha),
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
      eliminado_en: marca(fila.eliminadoEn),
    };
  }

  private static nota(fila: {
    id: string;
    encargoId: string;
    texto: string;
    fecha: Date;
    creadoEn: Date;
    actualizadoEn: Date;
  }): FilaSync {
    return {
      id: fila.id,
      encargo_id: fila.encargoId,
      texto: fila.texto,
      fecha: fecha(fila.fecha),
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
    };
  }

  private static foto(fila: {
    id: string;
    encargoId: string;
    objetoRecibidoId: string | null;
    url: string;
    creadoEn: Date;
    actualizadoEn: Date;
    eliminadoEn: Date | null;
  }): FilaSync {
    return {
      id: fila.id,
      encargo_id: fila.encargoId,
      objeto_recibido_id: fila.objetoRecibidoId,
      url: fila.url,
      creado_en: marca(fila.creadoEn),
      actualizado_en: marca(fila.actualizadoEn),
      eliminado_en: marca(fila.eliminadoEn),
    };
  }
}
