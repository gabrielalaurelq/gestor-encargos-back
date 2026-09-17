import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { Ambiente } from '../../../config/env.validation';

interface PrivilegiosRol {
  rol: string;
  superusuario: boolean;
  omite_rls: boolean;
}

// Doc 8, Bloque 1: PrismaService vive en shared/infrastructure/prisma/.
// La extensión de multitenancy (cliente REQUEST-scoped pre-filtrado por
// negocioId, Doc 4 Bloque 5 / Doc 8 Bloque 2) se agrega en el Bloque 3 de la
// Fase 2, encima de `enNegocio()`.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    await this.verificarRolSinBypassDeRls();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Ejecuta `fn` dentro de una transacción con `app.negocio_actual` fijado
   * (Doc 8 Bloque 2: `SET LOCAL` al abrir cada transacción autenticada).
   *
   * Es obligatorio para tocar cualquier tabla con RLS (todas salvo `negocios`
   * y `origenes_pago`): la migración inicial usa FORCE ROW LEVEL SECURITY y
   * el backend se conecta como dueño de las tablas, así que sin esta variable
   * la política no devuelve ninguna fila (falla cerrado). `set_config(...,
   * true)` equivale a SET LOCAL pero admite parámetros — evita interpolar el
   * id en SQL.
   */
  enNegocio<T>(negocioId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.negocio_actual', ${negocioId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Postgres exime de RLS a los superusuarios y a los roles con BYPASSRLS,
   * incluso con FORCE ROW LEVEL SECURITY. Conectarse con uno de ellos deja
   * la segunda capa de aislamiento por negocio (Doc 4 Bloque 4) desactivada
   * sin ningún síntoma — por eso se comprueba al arrancar: en development se
   * avisa (para no bloquear a nadie), en staging/producción la app no levanta.
   */
  private async verificarRolSinBypassDeRls(): Promise<void> {
    const [privilegios] = await this.$queryRaw<PrivilegiosRol[]>`
      SELECT rolname AS rol, rolsuper AS superusuario, rolbypassrls AS omite_rls
      FROM pg_roles WHERE rolname = current_user
    `;
    if (!privilegios.superusuario && !privilegios.omite_rls) return;

    const mensaje =
      `El rol de base de datos "${privilegios.rol}" es superusuario o tiene BYPASSRLS: ` +
      'Row-Level Security no se aplica y el aislamiento por negocio queda desactivado. ' +
      'Usar el rol de aplicación (infra/postgres/init/01-rol-aplicacion.sql).';

    if (this.config.getOrThrow<Ambiente>('NODE_ENV') === Ambiente.development) {
      this.logger.warn(mensaje);
      return;
    }
    throw new Error(mensaje);
  }
}
