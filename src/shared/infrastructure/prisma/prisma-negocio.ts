import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { RequestConSesion } from '../../presentation/auth/sesion-autenticada';
import { extensionFiltroNegocio } from './filtro-negocio';
import { PrismaService } from './prisma.service';

function crearClienteFiltrado(prisma: PrismaService, negocioId: string) {
  return prisma.$extends(extensionFiltroNegocio(negocioId));
}

type ClienteFiltrado = ReturnType<typeof crearClienteFiltrado>;

/** Cliente Prisma dentro de una transacción de negocio: filtrado + RLS activo. */
export type TransaccionNegocio = Omit<
  ClienteFiltrado,
  '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'
>;

/**
 * Cliente Prisma atado a un negocio. Combina las dos capas del Doc 4 Bloque 5:
 * la extensión que inyecta `negocioId` (aplicación) y `app.negocio_actual`
 * fijado en la transacción (RLS en Postgres). No expone consultas fuera de
 * transacción a propósito: sin la variable de sesión, RLS no devolvería nada.
 */
export class ClienteNegocio {
  private readonly cliente: ClienteFiltrado;

  constructor(
    prisma: PrismaService,
    readonly negocioId: string,
  ) {
    this.cliente = crearClienteFiltrado(prisma, negocioId);
  }

  transaccion<T>(fn: (tx: TransaccionNegocio) => Promise<T>): Promise<T> {
    return this.cliente.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.negocio_actual', ${this.negocioId}, true)`;
      return fn(tx as unknown as TransaccionNegocio);
    });
  }
}

// Doc 8, Bloque 1: provider REQUEST-scoped que toma el negocioId del JWT ya
// decodificado por el AuthGuard y entrega a cada caso de uso un cliente
// "pre-filtrado" — ningún caso de uso pasa negocioId a mano.
//
// La sesión se lee perezosamente (no en el constructor): Nest instancia los
// providers request-scoped antes de ejecutar los Guards, así que en ese
// momento `request.sesion` todavía no existe.
@Injectable({ scope: Scope.REQUEST })
export class PrismaNegocio {
  private cliente?: ClienteNegocio;

  constructor(
    @Inject(REQUEST) private readonly request: RequestConSesion,
    private readonly prisma: PrismaService,
  ) {}

  get negocioId(): string {
    return this.obtener().negocioId;
  }

  transaccion<T>(fn: (tx: TransaccionNegocio) => Promise<T>): Promise<T> {
    return this.obtener().transaccion(fn);
  }

  private obtener(): ClienteNegocio {
    if (!this.cliente) {
      if (!this.request.sesion) {
        throw new Error('PrismaNegocio usado en una ruta sin AuthGuard (¿marcada @Public()?)');
      }
      this.cliente = new ClienteNegocio(this.prisma, this.request.sesion.negocioId);
    }
    return this.cliente;
  }
}
