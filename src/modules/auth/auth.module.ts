import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthRepository } from './application/ports/auth.repository';
import { ServicioTokens } from './application/ports/servicio-tokens';
import { VerificadorIdentidad } from './application/ports/verificador-identidad';
import { CerrarSesionUseCase } from './application/use-cases/cerrar-sesion.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefrescarSesionUseCase } from './application/use-cases/refrescar-sesion.use-case';
import { FirebaseVerificadorIdentidad } from './infrastructure/firebase-verificador-identidad';
import { JwtServicioTokens } from './infrastructure/jwt-servicio-tokens';
import { PrismaAuthRepository } from './infrastructure/prisma-auth.repository';
import { AuthController } from './presentation/auth.controller';

// Doc 8, Bloque 1: los casos de uso dependen de las abstracciones (clases
// abstractas); Nest resuelve la implementación concreta acá.
// El AuthGuard (Doc 8 Bloque 2) se registra como APP_GUARD en AppModule, para
// fijar su orden respecto del guard de rate limiting; por eso se exporta
// ServicioTokens, su única dependencia.
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    RefrescarSesionUseCase,
    CerrarSesionUseCase,
    { provide: VerificadorIdentidad, useClass: FirebaseVerificadorIdentidad },
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    { provide: ServicioTokens, useClass: JwtServicioTokens },
  ],
  exports: [ServicioTokens],
})
export class AuthModule {}
