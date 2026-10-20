import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { Ambiente, validarEntorno } from './config/env.validation';
import { configurarLogger } from './config/logger.config';
import { LIMITE_GENERAL } from './config/rate-limit.config';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/presentation/guards/auth.guard';
import { BusquedaModule } from './modules/busqueda/busqueda.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { EncargosModule } from './modules/encargos/encargos.module';
import { MantenimientoModule } from './modules/mantenimiento/mantenimiento.module';
import { NegocioModule } from './modules/negocio/negocio.module';
import { ServiciosModule } from './modules/servicios/servicios.module';
import { SyncModule } from './modules/sync/sync.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { AlmacenamientoModule } from './shared/infrastructure/storage/almacenamiento.module';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';
import { ThrottlerNegocioGuard } from './shared/presentation/guards/throttler-negocio.guard';

// Doc 8, Bloque 4: @nestjs/config global con validación de esquema al
// arrancar (validarEntorno) y logger JSON con nestjs-pino.
// Doc 8, Bloque 2: AllExceptionsFilter como APP_FILTER; AuthGuard como
// APP_GUARD global. Doc 5, Bloque 4: rate limiting con ThrottlerNegocioGuard.
// Los dos guards se registran acá, en este orden, porque el throttler cuenta
// por negocio y necesita la sesión que deja el AuthGuard.
// Módulos: negocio propio, clientes, servicios, encargos, búsqueda global, el
// pull de sincronización y los jobs de mantenimiento.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEntorno,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        configurarLogger(config.getOrThrow<Ambiente>('NODE_ENV')),
    }),
    // Almacenamiento en memoria: suficiente con una sola instancia del
    // backend (MVP). Si se escala horizontalmente, pasar a ThrottlerStorageRedis.
    ThrottlerModule.forRoot([LIMITE_GENERAL]),
    // Doc 8 Bloque 3: jobs programados (MantenimientoModule).
    ScheduleModule.forRoot(),
    PrismaModule,
    AlmacenamientoModule,
    AuthModule,
    NegocioModule,
    ClientesModule,
    ServiciosModule,
    EncargosModule,
    BusquedaModule,
    SyncModule,
    MantenimientoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerNegocioGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
