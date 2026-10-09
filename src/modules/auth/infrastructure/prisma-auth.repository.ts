import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ErrorAutenticacion } from '../../../shared/application/error-autenticacion';
import { FcmTokenEnUsoError } from '../application/fcm-token-en-uso.error';
import { AuthRepository, NegocioAutenticado } from '../application/ports/auth.repository';

const VIOLACION_UNICIDAD = 'P2002';
const FILA_INEXISTENTE = 'P2025';

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // `negocios` no tiene RLS (es la tabla que define al tenant), así que el
  // upsert va directo. Con `update: {}` dos primeros logins concurrentes del
  // mismo uid convergen en la misma fila gracias al UNIQUE de google_uid.
  buscarOCrearNegocio(googleUid: string): Promise<NegocioAutenticado> {
    return this.prisma.negocio.upsert({
      where: { googleUid },
      create: { googleUid },
      update: {},
      select: { id: true, nombreNegocio: true },
    });
  }

  // `dispositivos` sí tiene RLS forzado → todo pasa por enNegocio().
  crearDispositivo(negocioId: string, dispositivoId: string, refreshTokenHash: string) {
    return this.prisma.enNegocio(negocioId, async (tx) => {
      await tx.dispositivo.create({
        data: { id: dispositivoId, negocioId, refreshTokenHash },
      });
    });
  }

  existeDispositivo(negocioId: string, dispositivoId: string, refreshTokenHash: string) {
    return this.prisma.enNegocio(negocioId, async (tx) => {
      const coincidencias = await tx.dispositivo.count({
        where: { id: dispositivoId, negocioId, refreshTokenHash },
      });
      return coincidencias > 0;
    });
  }

  eliminarDispositivo(negocioId: string, dispositivoId: string) {
    return this.prisma.enNegocio(negocioId, async (tx) => {
      await tx.dispositivo.deleteMany({ where: { id: dispositivoId, negocioId } });
    });
  }

  fijarFcmToken(negocioId: string, dispositivoId: string, fcmToken: string | null) {
    return this.prisma.enNegocio(negocioId, async (tx) => {
      if (fcmToken !== null) {
        // Firebase reasigna el mismo token cuando la app se reinstala, así que
        // primero se suelta de cualquier otra fila de este negocio que lo
        // tuviera. Sin esto, el UNIQUE global rechazaría la asignación.
        await tx.dispositivo.updateMany({
          where: { negocioId, fcmToken, NOT: { id: dispositivoId } },
          data: { fcmToken: null },
        });
      }

      try {
        await tx.dispositivo.update({
          where: { id: dispositivoId },
          data: { fcmToken },
        });
      } catch (error) {
        // Si sigue chocando, el token lo tiene un dispositivo de otro negocio:
        // RLS no lo deja ver ni limpiar.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
          throw error;
        }
        if (error.code === VIOLACION_UNICIDAD) {
          throw new FcmTokenEnUsoError();
        }
        // La fila ya no existe: este dispositivo cerró sesión, pero su access
        // token sigue vigente porque el AuthGuard no consulta la base en cada
        // petición. No es un error interno — la sesión dejó de existir.
        if (error.code === FILA_INEXISTENTE) {
          throw new ErrorAutenticacion(
            'SESION_INVALIDA',
            'La sesión de este dispositivo ya no existe.',
          );
        }
        throw error;
      }
    });
  }
}
