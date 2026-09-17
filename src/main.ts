import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { configurarAplicacion } from './app.config';
import { AppModule } from './app.module';
import { Ambiente } from './config/env.validation';

async function bootstrap() {
  // bufferLogs: los logs del arranque se retienen hasta enganchar pino.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  configurarAplicacion(app, config.getOrThrow<Ambiente>('NODE_ENV'));

  // Cierra la conexión de Prisma (onModuleDestroy) ante SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('PORT'));
}

bootstrap();
