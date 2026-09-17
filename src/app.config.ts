import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Ambiente } from './config/env.validation';

export const PREFIJO_API = 'api/v1';
export const RUTA_DOCS = 'api/docs';

// Configuración HTTP común a main.ts y a los tests e2e, para que ambos
// ejerciten exactamente la misma app (prefijo, validación, Swagger).
export function configurarAplicacion(app: INestApplication, ambiente: Ambiente): void {
  // Doc 5, Bloque 1/5: toda la API vive bajo /api/v1 (versionado por path).
  app.setGlobalPrefix(PREFIJO_API);

  // No anunciar el framework en cada respuesta (header X-Powered-By).
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');

  // Doc 3 Bloque 5: staging/producción corren detrás del proxy del hosting
  // gestionado. Sin `trust proxy`, req.ip sería la IP del proxy y el límite
  // por IP de /auth/* (Doc 5 Bloque 4) castigaría a todos los usuarios a la
  // vez. En development no hay proxy y confiar en X-Forwarded-For permitiría
  // falsear la IP, así que se deja apagado.
  if (ambiente !== Ambiente.development) {
    express.set('trust proxy', 1);
  }

  // Doc 5, Bloque 3: errores de formato (DTO inválido) devuelven 400 antes
  // de llegar a la lógica de negocio.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Doc 5, Bloque 5: OpenAPI generado desde los decoradores, expuesto en
  // /api/docs solo en development y staging — nunca en producción.
  if (ambiente !== Ambiente.production) {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Gestor de Encargos — API')
        .setVersion('v1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(RUTA_DOCS, app, documento);
  }
}
