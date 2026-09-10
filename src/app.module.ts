import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';

// Doc 8, Bloque 4: @nestjs/config con validación de esquema al arrancar
// (el esquema de validación se agrega en la Fase 2, junto con las variables
// de Firebase/R2 que todavía no se usan). Doc 3, Bloque 4: cada ambiente
// (development/staging/production) trae su propio .env, no committeado —
// este checkout solo versiona .env.example como plantilla.
// Sin módulos de negocio todavía (modules/ queda vacío) — Sprint 1-2.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
  ],
})
export class AppModule {}
