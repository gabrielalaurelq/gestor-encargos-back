-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "dias_aviso_no_recoge" INTEGER NOT NULL DEFAULT 2;

-- Escrito a mano: PRD 13, umbral razonable del aviso "Cliente no recoge".
-- Prisma no gestiona CHECK; la API valida el mismo rango (400) antes de llegar acá.
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_dias_aviso_no_recoge_rango"
    CHECK ("dias_aviso_no_recoge" BETWEEN 1 AND 30);
