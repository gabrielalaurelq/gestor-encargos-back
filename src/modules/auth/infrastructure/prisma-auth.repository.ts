import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AuthRepository, NegocioAutenticado } from '../application/ports/auth.repository';

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
}
