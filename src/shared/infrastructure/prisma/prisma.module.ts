import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global para que cualquier módulo de negocio (Sprint 1-2) pueda inyectar
// PrismaService sin re-importar este módulo en cada uno.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
