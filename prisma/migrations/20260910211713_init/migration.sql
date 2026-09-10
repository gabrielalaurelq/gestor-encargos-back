-- CreateEnum
CREATE TYPE "EncargoEstado" AS ENUM ('INGRESADO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'PAUSADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PagoTipo" AS ENUM ('ADELANTO', 'PAGO');

-- CreateEnum
CREATE TYPE "NegocioPlan" AS ENUM ('FREE', 'PREMIUM');

-- CreateTable
CREATE TABLE "negocios" (
    "id" TEXT NOT NULL,
    "nombre_negocio" TEXT,
    "google_uid" TEXT NOT NULL,
    "siguiente_bloque_numeros" INTEGER NOT NULL DEFAULT 1,
    "plan" "NegocioPlan" NOT NULL DEFAULT 'FREE',
    "plan_vence_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivos" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "fcm_token" TEXT,
    "refresh_token_hash" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispositivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encargos" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "numero" INTEGER,
    "descripcion" TEXT NOT NULL,
    "estado" "EncargoEstado" NOT NULL DEFAULT 'INGRESADO',
    "precio_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldo_pendiente" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ubicacion_fisica" TEXT,
    "notas_generales" TEXT,
    "fecha_entrega_prometida" DATE NOT NULL,
    "fecha_entrega_acordada" DATE NOT NULL,
    "fecha_listo" DATE,
    "fecha_entrega_real" DATE,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objetos_recibidos" (
    "id" TEXT NOT NULL,
    "encargo_id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "objetos_recibidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos" (
    "id" TEXT NOT NULL,
    "encargo_id" TEXT NOT NULL,
    "objeto_recibido_id" TEXT,
    "negocio_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajos" (
    "id" TEXT NOT NULL,
    "encargo_id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "servicio_id" TEXT,
    "objeto_recibido_id" TEXT,
    "descripcion" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "trabajos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiales" (
    "id" TEXT NOT NULL,
    "trabajo_id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" TEXT,
    "costo" DECIMAL(10,2),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origenes_pago" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "origenes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" TEXT NOT NULL,
    "encargo_id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "origen_id" INTEGER NOT NULL,
    "tipo" "PagoTipo" NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas" (
    "id" TEXT NOT NULL,
    "encargo_id" TEXT NOT NULL,
    "negocio_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "negocios_google_uid_key" ON "negocios"("google_uid");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_fcm_token_key" ON "dispositivos"("fcm_token");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_refresh_token_hash_key" ON "dispositivos"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "dispositivos_negocio_id_idx" ON "dispositivos"("negocio_id");

-- CreateIndex
CREATE INDEX "clientes_negocio_id_idx" ON "clientes"("negocio_id");

-- CreateIndex
CREATE INDEX "encargos_negocio_id_estado_fecha_entrega_acordada_idx" ON "encargos"("negocio_id", "estado", "fecha_entrega_acordada");

-- CreateIndex
CREATE INDEX "encargos_cliente_id_fecha_entrega_acordada_idx" ON "encargos"("cliente_id", "fecha_entrega_acordada");

-- CreateIndex
CREATE UNIQUE INDEX "encargos_negocio_id_numero_key" ON "encargos"("negocio_id", "numero");

-- CreateIndex
CREATE INDEX "objetos_recibidos_negocio_id_idx" ON "objetos_recibidos"("negocio_id");

-- CreateIndex
CREATE INDEX "fotos_negocio_id_idx" ON "fotos"("negocio_id");

-- CreateIndex
CREATE INDEX "servicios_negocio_id_idx" ON "servicios"("negocio_id");

-- CreateIndex
CREATE INDEX "trabajos_negocio_id_idx" ON "trabajos"("negocio_id");

-- CreateIndex
CREATE INDEX "materiales_negocio_id_idx" ON "materiales"("negocio_id");

-- CreateIndex
CREATE UNIQUE INDEX "origenes_pago_nombre_key" ON "origenes_pago"("nombre");

-- CreateIndex
CREATE INDEX "pagos_negocio_id_fecha_tipo_origen_id_idx" ON "pagos"("negocio_id", "fecha", "tipo", "origen_id");

-- CreateIndex
CREATE INDEX "notas_negocio_id_idx" ON "notas"("negocio_id");

-- AddForeignKey
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encargos" ADD CONSTRAINT "encargos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encargos" ADD CONSTRAINT "encargos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetos_recibidos" ADD CONSTRAINT "objetos_recibidos_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetos_recibidos" ADD CONSTRAINT "objetos_recibidos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_objeto_recibido_id_fkey" FOREIGN KEY ("objeto_recibido_id") REFERENCES "objetos_recibidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_objeto_recibido_id_fkey" FOREIGN KEY ("objeto_recibido_id") REFERENCES "objetos_recibidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "origenes_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_encargo_id_fkey" FOREIGN KEY ("encargo_id") REFERENCES "encargos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Lo siguiente no es expresable en el DSL de Prisma (Doc 4, Bloques 2 y 4) y se
-- agrega a mano sobre la migración generada, antes de aplicarla.
-- =============================================================================

-- Búsqueda tolerante (Doc 4 Bloque 4, PRD módulo 16 / Caso 8)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "clientes_nombre_trgm_idx" ON "clientes" USING GIN ("nombre" gin_trgm_ops);
CREATE INDEX "clientes_telefono_trgm_idx" ON "clientes" USING GIN ("telefono" gin_trgm_ops);
CREATE INDEX "encargos_descripcion_trgm_idx" ON "encargos" USING GIN ("descripcion" gin_trgm_ops);
CREATE INDEX "encargos_ubicacion_fisica_trgm_idx" ON "encargos" USING GIN ("ubicacion_fisica" gin_trgm_ops);

-- Índices parciales (Doc 4 Bloque 4) — cubren exactamente las consultas de
-- Dashboard/atrasados, Balance de Carga/Calendario y el job de Recordatorios,
-- sin escanear filas que esos módulos nunca cuentan.
CREATE INDEX "encargos_atrasados_idx"
    ON "encargos" ("negocio_id", "estado", "fecha_entrega_acordada")
    WHERE "fecha_listo" IS NULL;

CREATE INDEX "encargos_balance_carga_idx"
    ON "encargos" ("negocio_id", "fecha_entrega_acordada")
    WHERE "estado" NOT IN ('ENTREGADO', 'CANCELADO');

CREATE INDEX "encargos_cliente_no_recoge_idx"
    ON "encargos" ("negocio_id", "fecha_listo")
    WHERE "fecha_entrega_real" IS NULL;

-- CHECK constraints (Doc 4 Bloque 2)
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_nombre_no_vacio" CHECK (length(trim("nombre")) > 0);
ALTER TABLE "encargos" ADD CONSTRAINT "encargos_descripcion_no_vacio" CHECK (length(trim("descripcion")) > 0);
ALTER TABLE "notas" ADD CONSTRAINT "notas_texto_no_vacio" CHECK (length(trim("texto")) > 0);
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_nombre_no_vacio" CHECK (length(trim("nombre")) > 0);
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_descripcion_no_vacio" CHECK (length(trim("descripcion")) > 0);
ALTER TABLE "objetos_recibidos" ADD CONSTRAINT "objetos_recibidos_descripcion_no_vacio" CHECK (length(trim("descripcion")) > 0);

ALTER TABLE "servicios" ADD CONSTRAINT "servicios_precio_no_negativo" CHECK ("precio" >= 0);
ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_precio_no_negativo" CHECK ("precio" >= 0);
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_costo_no_negativo" CHECK ("costo" IS NULL OR "costo" >= 0);
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "encargos" ADD CONSTRAINT "encargos_descuento_no_negativo" CHECK ("descuento" >= 0);

-- Row-Level Security (Doc 4 Bloque 4) — segunda capa de aislamiento por
-- negocio, además del filtro explícito en cada query de Prisma (Doc 4 Bloque
-- 5, Doc 8 Bloque 2). El backend fija `app.negocio_actual` con
-- `SET LOCAL` al abrir cada transacción autenticada. `current_setting(...,
-- true)` con missing_ok=true hace que, si esa variable no se fijó, la
-- política devuelva NULL (ninguna fila visible) en vez de un error duro —
-- falla cerrado, no abierto. FORCE ROW LEVEL SECURITY es necesario porque el
-- backend se conecta con el mismo rol que es dueño de las tablas; sin esto,
-- Postgres exime al dueño de la tabla de sus propias políticas.
-- Los ids son TEXT (Prisma `@default(uuid())` sin `@db.Uuid`), así que la
-- comparación es texto-a-texto, sin cast a uuid.
DO $$
DECLARE
    tabla TEXT;
BEGIN
    FOREACH tabla IN ARRAY ARRAY[
        'dispositivos', 'clientes', 'encargos', 'objetos_recibidos', 'fotos',
        'servicios', 'trabajos', 'materiales', 'pagos', 'notas'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabla);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabla);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING ("negocio_id" = current_setting(''app.negocio_actual'', true))',
            tabla || '_negocio_isolation',
            tabla
        );
    END LOOP;
END $$;
