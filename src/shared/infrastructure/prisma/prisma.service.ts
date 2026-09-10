import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Doc 8, Bloque 1: PrismaService vive en shared/infrastructure/prisma/.
// La extensión de multitenancy (filtro automático por negocioId + RLS por
// sesión, Doc 4 Bloque 5 / Doc 8 Bloque 2) se agrega en la Fase 2 del plan
// de Sprint 0, junto con el AuthGuard del que depende el negocioId.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
