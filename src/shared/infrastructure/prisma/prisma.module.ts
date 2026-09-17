import { Global, Module } from '@nestjs/common';
import { PrismaNegocio } from './prisma-negocio';
import { PrismaService } from './prisma.service';

// Global para que cualquier módulo de negocio (Sprint 1-2) pueda inyectar
// PrismaNegocio (cliente por request, filtrado por negocio) o PrismaService
// (crudo — solo para auth, jobs y tablas sin RLS) sin re-importar este módulo.
@Global()
@Module({
  providers: [PrismaService, PrismaNegocio],
  exports: [PrismaService, PrismaNegocio],
})
export class PrismaModule {}
