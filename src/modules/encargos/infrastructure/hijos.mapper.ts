import { PagoTipo, Prisma } from '@prisma/client';
import { Monto } from '../../../shared/domain/monto';
import { Foto } from '../domain/foto';
import { Material } from '../domain/material';
import { Nota } from '../domain/nota';
import { ObjetoRecibido } from '../domain/objeto-recibido';
import { Pago, TipoPago } from '../domain/pago';
import { Trabajo } from '../domain/trabajo';

// Proyecciones y traducciones Prisma ↔ dominio de los hijos del agregado.
// Única frontera con `Prisma.Decimal` y con los enums generados: hacia dentro
// solo circulan `Monto` y los enums propios de `domain/`.

export const CAMPOS_OBJETO = {
  id: true,
  descripcion: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export const CAMPOS_TRABAJO = {
  id: true,
  servicioId: true,
  objetoRecibidoId: true,
  descripcion: true,
  precio: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export const CAMPOS_MATERIAL = {
  id: true,
  trabajoId: true,
  nombre: true,
  cantidad: true,
  costo: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export const CAMPOS_FOTO = {
  id: true,
  objetoRecibidoId: true,
  clave: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export const CAMPOS_PAGO = {
  id: true,
  monto: true,
  origenId: true,
  tipo: true,
  fecha: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export const CAMPOS_NOTA = {
  id: true,
  texto: true,
  fecha: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

/** Los hijos borrados no existen para el dominio (tombstones, Doc 4 Bloque 3). */
export const VIVOS = { eliminadoEn: null } as const;

export function aObjetoDominio(fila: {
  id: string;
  descripcion: string;
  creadoEn: Date;
  actualizadoEn: Date;
}): ObjetoRecibido {
  return ObjetoRecibido.reconstituir(fila);
}

export function aTrabajoDominio(fila: {
  id: string;
  servicioId: string | null;
  objetoRecibidoId: string | null;
  descripcion: string;
  precio: Prisma.Decimal;
  creadoEn: Date;
  actualizadoEn: Date;
}): Trabajo {
  return Trabajo.reconstituir({ ...fila, precio: fila.precio.toString() });
}

export function aMaterialDominio(fila: {
  id: string;
  trabajoId: string;
  nombre: string;
  cantidad: string | null;
  costo: Prisma.Decimal | null;
  creadoEn: Date;
  actualizadoEn: Date;
}): Material {
  return Material.reconstituir({ ...fila, costo: fila.costo?.toString() ?? null });
}

export function aFotoDominio(fila: {
  id: string;
  objetoRecibidoId: string | null;
  clave: string;
  creadoEn: Date;
  actualizadoEn: Date;
}): Foto {
  return Foto.reconstituir(fila);
}

export function aPagoDominio(fila: {
  id: string;
  monto: Prisma.Decimal;
  origenId: number;
  tipo: PagoTipo;
  fecha: Date;
  creadoEn: Date;
  actualizadoEn: Date;
}): Pago {
  return Pago.reconstituir({
    ...fila,
    monto: fila.monto.toString(),
    tipo: fila.tipo as unknown as TipoPago,
  });
}

export function aNotaDominio(fila: {
  id: string;
  texto: string;
  fecha: Date;
  creadoEn: Date;
  actualizadoEn: Date;
}): Nota {
  return Nota.reconstituir(fila);
}

export function montoDesdeSuma(valor: Prisma.Decimal | null): Monto {
  return valor === null ? Monto.CERO : Monto.desde(valor.toString());
}
