// Doc 4, Bloque 1: origenes_pago es un catálogo semilla del sistema (Efectivo,
// Transferencia, Yape, Plin), no algo que cree el negociante — se precarga acá,
// nunca a través del código de la aplicación.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORIGENES_PAGO = ['Efectivo', 'Transferencia', 'Yape', 'Plin'];

async function main() {
  for (const nombre of ORIGENES_PAGO) {
    await prisma.origenPago.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
  }
  console.log(`Sembrados ${ORIGENES_PAGO.length} orígenes de pago.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
