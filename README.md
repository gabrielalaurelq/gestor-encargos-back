# Backend — NestJS

**Estado:** 🔵 En desarrollo — Sprint 0 / Fase 2 (autenticación y multitenancy), ver `docs/11-roadmap.md`

Documentos base, todos aprobados: Doc 3 (Arquitectura), Doc 4 (Base de Datos), Doc 5 (API), Doc 8 (Backend).

## Hecho

### Fase 1 — Infraestructura base

- Proyecto NestJS inicializado (`package.json`, `tsconfig.json` + `tsconfig.build.json`, `nest-cli.json`, lint/format).
- `prisma/schema.prisma` completo — las 12 tablas del Doc 4 v1.4 (11 con `negocio_id` + el catálogo `origenes_pago`).
- Migración inicial con el SQL que Prisma no expresa: índices GIN/pg_trgm, índices parciales, `CHECK`s y políticas RLS (`FORCE ROW LEVEL SECURITY`, variable `app.negocio_actual`).
- `prisma/seed.ts` — precarga los 4 `origenes_pago`.
- `PrismaService`/`PrismaModule` (`src/shared/infrastructure/prisma/`).

### Fase 2, Bloque 1 — Cimientos transversales

- **Validación de entorno al arrancar** (`src/config/env.validation.ts`, Doc 8 Bloque 4): falla rápido si falta una variable; fuera de `development` rechaza además los valores de plantilla de `.env.example`.
- **Filtro global de errores** (`src/shared/presentation/filters/all-exceptions.filter.ts`, Doc 8 Bloque 2): toda respuesta 4xx/5xx sale como `{ error: { codigo, mensaje, detalles } }` (Doc 5 Bloque 3). `DomainError` → `422` con el código del catálogo; `ErrorAutenticacion` → `401`; class-validator → `400 SOLICITUD_INVALIDA`; desconocidos → `500 ERROR_INTERNO` sin filtrar detalle interno.
- **Prefijo `/api/v1`**, **Swagger** en `/api/docs` (no en `production`), **logger JSON con nestjs-pino** que redacta `Authorization`, `id_token` y `refresh_token` (`src/app.config.ts`, `src/config/logger.config.ts`).
- Jest configurado (unitarios en `src/**/*.spec.ts`, e2e en `test/`).

### Fase 2, Bloque 2 — Módulo `auth` (`src/modules/auth/`)

Doc 5 Bloque 1 / Doc 8 Bloque 2, con la estructura de capas del Doc 8 Bloque 1:

- `application/ports/` — `VerificadorIdentidad`, `AuthRepository`, `ServicioTokens` (clases abstractas; los casos de uso solo dependen de ellas).
- `application/use-cases/` — `LoginUseCase`, `RefrescarSesionUseCase`, `CerrarSesionUseCase`.
- `infrastructure/` — `FirebaseVerificadorIdentidad` (Firebase Admin, inicialización perezosa), `JwtServicioTokens`, `PrismaAuthRepository`.
- `presentation/` — `AuthController` (`POST /auth/login|refresh|logout`) y `AuthGuard` global (`APP_GUARD`).
- Compartido en `src/shared/presentation/auth/`: `@Public()`, `@SesionActual()`, `SesionAutenticada { negocioId, dispositivoId }`.
- `PrismaService.enNegocio(negocioId, fn)` — transacción con `app.negocio_actual` fijado; obligatoria para toda tabla con RLS.

**Decisiones tomadas en este bloque (no estaban cerradas en los Docs):**

| Decisión | Elección | Motivo |
|---|---|---|
| Formato del refresh token | JWT firmado (`tipo: refresh`, `sub` = negocioId, `dis` = dispositivoId, `jti` aleatorio) | `dispositivos` tiene RLS forzado: `/auth/refresh` necesita el `negocioId` antes de poder buscar la fila por hash. |
| Hash persistido en `dispositivos.refresh_token_hash` | SHA-256 hex | Se busca por igualdad en una columna única → hash determinista. bcrypt (con sal) no sirve para eso; se retiró de las dependencias. |
| Vigencia del refresh token | `JWT_REFRESH_EXPIRES_IN`, default `90d` | Doc 3 solo decía "larga duración". Sin rotación: el mismo token vale hasta vencer o hasta `/auth/logout`. |
| Access token | `JWT_ACCESS_EXPIRES_IN` (`30m`), claim `tipo: access` | El claim `tipo` impide usar un refresh como access o viceversa. |
| Identidad del dispositivo | `dispositivoId` generado en el login y llevado en ambos tokens | `/auth/logout` borra exactamente su fila; también servirá para el token FCM. |
| Códigos 401 | `TOKEN_AUSENTE`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO`, `SESION_INVALIDA`, `ID_TOKEN_INVALIDO`, `PROVEEDOR_NO_PERMITIDO` | Complementan el catálogo 422 del Doc 5 Bloque 3. |
| Rol de base de datos | Nunca superusuario ni `BYPASSRLS` (ver `infra/README.md`) | Postgres exime a esos roles de RLS aunque haya `FORCE`. `PrismaService` lo verifica al arrancar: avisa en `development`, aborta en `staging`/`production`. |

### Fase 2, Bloque 3 — Multitenancy en Prisma + rate limiting

- **`PrismaNegocio`** (`src/shared/infrastructure/prisma/prisma-negocio.ts`, Doc 4 Bloque 5 / Doc 8 Bloque 1): provider `REQUEST`-scoped que toma el `negocioId` de la sesión dejada por el `AuthGuard` y expone `transaccion(fn)`. Dentro de esa transacción actúan las dos capas a la vez: la extensión `filtro-negocio.ts` inyecta `negocioId` en toda lectura y escritura de los 10 modelos con `negocio_id` (derivados del schema, no de una lista a mano), y `app.negocio_actual` queda fijado para RLS. **Es el único cliente Prisma que deben usar los módulos de negocio**; `PrismaService` crudo queda para auth, jobs y tablas sin RLS.
- Si un caso de uso pasa un `negocioId` distinto al de la sesión, la extensión lanza `NegocioAjenoError` en vez de corregirlo en silencio. Límite conocido: los `create` anidados (hijos de Encargo) no pasan por el hook y deben llevar `negocioId` explícito; NOT NULL y RLS los respaldan.
- **Rate limiting** (`@nestjs/throttler`, Doc 5 Bloque 4): `ThrottlerNegocioGuard` cuenta por negocio autenticado (por IP en rutas públicas). General 100/min; `/auth/login` y `/auth/refresh` 10/min (`src/config/rate-limit.config.ts`). Respuesta `429 LIMITE_EXCEDIDO` con `Retry-After`. Almacenamiento en memoria (una instancia); pasar a Redis si se escala horizontalmente.
- `trust proxy` activo fuera de `development` para que la IP real llegue detrás del proxy del hosting.
- Tests de integración: `test/prisma-negocio.e2e-spec.ts` (dos negocios, ninguno ve ni toca lo del otro, por extensión y por RLS) y `test/rate-limit.e2e-spec.ts`.

### Fase 4 — CI/CD e imagen de despliegue

- **`Dockerfile`** multi-etapa (deps → build → runtime `node:24-alpine`, usuario sin privilegios, `npm prune --omit=dev`). Las migraciones **no** corren al arrancar el contenedor: las aplica el pipeline (Doc 8 Bloque 1).
- **`.github/workflows/ci.yml`** — en cada PR y push a `main`: job `calidad` (`prisma validate`, `lint:check`, `typecheck`, unitarios, build) y job `e2e` contra un Postgres 16 de servicio, creando el rol `gestor_app` con el mismo SQL que `infra/postgres/init/` para que **RLS aplique también en CI** (con el superusuario los tests de aislamiento pasarían en falso).
- **`.github/workflows/deploy.yml`** — `main` → staging, tag `vX.Y.Z` → producción con aprobación manual (GitHub Environments). **Apagado** hasta que exista la variable `DESPLIEGUE_HABILITADO=true`: el proveedor de hosting sigue pendiente (Doc 3 Bloque 5), y el último paso de cada job falla a propósito con el motivo.
- `.nvmrc` (24) como única fuente de la versión de Node para CI y Docker; `engines.node >= 22` en `package.json`.

**Sprint 0 completo.**

### Sprint 1 — Módulo `clientes` (`src/modules/clientes/`)

Primer Bounded Context con las cuatro capas del Doc 8 Bloque 1, y primer uso real de `PrismaNegocio` extremo a extremo.

- `domain/` — `Telefono` (primer Value Object del Doc 2: inmutable, se autovalida, igualdad por valor), `Cliente` (agregado raíz; `crear()` para altas y `reconstituir()` para rehidratar), errores del catálogo y el puerto `ClienteRepository`.
- `application/` — DTOs con `class-validator` y los casos de uso `Listar`, `Crear`, `Obtener`, `Actualizar`.
- `infrastructure/` — `PrismaClienteRepository` sobre `PrismaNegocio`; el conteo de la paginación va en la misma transacción que la página.
- `presentation/` — `ClientesController` y el mapper a snake_case.
- Compartido y reutilizable por Servicios/Encargos: `PaginacionQuery` (`?pagina=&por_pagina=`, tope 100) y `respuestaPaginada()` → `{datos, pagina, por_pagina, total}` (Doc 5 Bloque 4).

Endpoints: `GET /clientes?q=&pagina=&por_pagina=`, `POST /clientes`, `GET /clientes/{id}`, `PATCH /clientes/{id}`.

**Decisiones tomadas en este módulo (no estaban cerradas en los Docs):**

| Decisión | Elección | Motivo |
|---|---|---|
| Idempotencia del `POST` | El cuerpo acepta un `id` UUID opcional; si ese id ya existe en el negocio, responde `200` con el existente en vez de `201` | El Doc 3 fija UUIDs generados en el dispositivo y el Doc 5 Bloque 1 reintenta cada escritura de la cola Outbox como un POST normal. Si se pierde la *respuesta*, el reintento duplicaría. **El Doc 5 Bloque 2 debería enmendarse: hoy describe el cuerpo sin `id`.** |
| Carrera entre dos reintentos | El que choca contra la llave primaria relee y devuelve la fila del otro | Ambos pasan la comprobación previa; sin esto, uno devolvería `500`. |
| Reusar el `id` de otro negocio | `409 CONFLICTO` con mensaje neutro | La llave primaria es global, los negocios no. Decir de quién es el id confirmaría su existencia en otro tenant — justo lo que el Doc 5 evita al preferir `404` sobre `403`. No es enumerable: habría que adivinar un UUID v4 entero. |
| Formato del teléfono | E.164 estricto, sin normalizar | Normalizar obligaría al backend a adivinar el país; el Doc 1 ya pone esa decisión en la UI (9 dígitos peruanos por defecto + toggle internacional). Una sola verdad. |
| `nombre` vacío y teléfono inválido | `422` desde el dominio, no `400` desde el DTO | El catálogo del Doc 5 Bloque 3 nombra `CLIENTE_NOMBRE_VACIO` como código de negocio; además `"   "` pasa `@IsNotEmpty()` pero viola el `CHECK length(trim(...)) > 0` del Doc 4. Los DTOs solo validan tipo y formato. |
| `PATCH` sin cambios reales | No escribe | `actualizado_en` alimenta el delta sync (LWW); moverlo sin motivo haría que todos los dispositivos se bajaran de nuevo una fila idéntica. |
| Semántica del `PATCH` parcial | Campo ausente = sin cambios; `"telefono": null` = borrar | `whitelist: true` conserva las claves declaradas que llegan en `null`, así que `undefined` y `null` se distinguen. |

**Fuera de alcance hasta Sprint 2** (dependen del módulo Encargos, que aún no existe): `GET /clientes/{id}/encargos` y el resumen de Historial dentro de `GET /clientes/{id}`.

### Sprint 1 — Módulo `servicios` (`src/modules/servicios/`) + VO `Monto`

Catálogo de servicios (PRD módulo 4, Doc 2 agregado raíz independiente). Endpoints: `GET /servicios?incluir_inactivos=`, `POST /servicios`, `PATCH /servicios/{id}`. **Sin `DELETE`**, a propósito: un Servicio nunca se elimina, solo se desactiva (Doc 2, invariante 14).

- **`Monto`** (`src/shared/domain/monto.ts`) — segundo Value Object del Doc 2, y el más reutilizado de aquí en adelante (Servicios, Trabajos, Pagos, Encargos). Guarda **céntimos enteros**: un `number` decimal arrastra error binario (`0.1 + 0.2 ≠ 0.3`) y justo acá se suman precios para `precio_total` y `saldo_pendiente`; `Prisma.Decimal` daría exactitud pero metería un import de Prisma en `domain/`, que el Doc 8 prohíbe. Con `DECIMAL(10,2)` el máximo en céntimos (9 999 999 999) entra holgado en el entero exacto de JavaScript. No restringe el signo, como pide el Doc 2 — cada entidad aplica su regla.
- **Idempotencia extraída a `shared/application/crear-idempotente.ts`**, con `RecursoDuplicadoError` en `shared/domain/`. Clientes se refactorizó para usarla. El motivo no es ahorrar líneas: el caso del `409` es una decisión de seguridad y el Doc 5 Bloque 2 tiene seis altas con la misma forma; seis copias serían seis oportunidades de que una se desviara.

**Decisiones tomadas en este módulo:**

| Decisión | Elección | Motivo |
|---|---|---|
| Dinero en JSON | Número con 2 decimales (`"precio": 20.5`), no string | El Doc 5 Bloque 3 ya usa números para dinero en su ejemplo de error. Con `DECIMAL(10,2)` el valor entra exacto en un double; el backend nunca opera con floats — la aritmética vive en `Monto`. |
| Tercer decimal en el precio | `422 MONTO_INVALIDO`, no se redondea | Redondear dinero en silencio esconde un error del cliente. |
| Precio `0` | Válido | PRD módulo 4: "sin precio mínimo forzado" (ej. retoque de garantía). Solo se rechaza el negativo, igual que el `CHECK` del Doc 4. |
| Nombres duplicados en el catálogo | Permitidos | PRD módulo 4: "el MVP no bloquea duplicados; es responsabilidad del negociante mantener su catálogo ordenado". |
| Editar el `nombre` | **No** se permite; el `PATCH` solo acepta `precio` y `activo` | El Doc 5 Bloque 2 define el endpoint como "editar precio o `activo`", y ni el PRD (flujo 3b) ni el Doc 2 contemplan renombrar. Para corregir un nombre: desactivar y crear otro, que es el camino que el modelo ya prevé al no permitir borrado. **Revisable si la UI lo pide.** |
| No retroactividad del precio (Doc 2, invariante 12) | No se implementa nada | El Trabajo copia nombre y precio al crearse; la no retroactividad se obtiene por construcción. La responsabilidad recae en Encargos (Sprint 3-4): debe **copiar**, no referenciar. |

### Sprint 2 — Módulo `encargos` (`src/modules/encargos/`), núcleo del agregado raíz

Endpoints: `GET /encargos?estado=&fecha_desde=&fecha_hasta=&cliente_id=`, `POST /encargos`, `GET /encargos/{id}`, `PATCH /encargos/{id}`, `PATCH /encargos/{id}/estado` y `POST /encargos/reservar-bloque-numeros`.

- `domain/` — VO **`RangoFechasEntrega`** (agrupa las 4 fechas y encapsula los invariantes 6-8: la prometida no tiene ningún método que la toque, y `listo`/`entregaReal` solo se asignan vía `marcarListo`/`marcarEntregado`, nunca con setters); **`EstadoEncargo`** con su tabla de transiciones; entidad **`Encargo`** con `recalcular()` como único sitio que deriva `precio_total`/`descuento`/`saldo_pendiente` (invariantes 1-3).
- `shared/domain/fecha.ts` — las 4 fechas son `DATE` sin hora, así que se normalizan a medianoche UTC y "hoy" se calcula en `America/Lima`. Sin eso, un servidor en UTC fecharía al día siguiente todo lo marcado entre las 19:00 y la medianoche de Lima.
- La **máquina de estados** sale de PRD módulo 6 (líneas 308-329), no solo del Doc 2: saltarse estados está permitido, y al entregar directamente desde `INGRESADO` ambas fechas quedan con el mismo día.
- **Numeración Hi/Lo** (Doc 3, ADR-008): `POST /encargos/reservar-bloque-numeros` sobre `negocios.siguiente_bloque_numeros`, con un único `UPDATE ... increment ... RETURNING` para que dos dispositivos simultáneos reciban rangos disjuntos. Bloques de 100.

**Decisiones tomadas en este módulo:**

| Decisión | Elección | Motivo |
|---|---|---|
| **`POST /encargos/reservar-bloque-numeros` no estaba en el Doc 5** | Implementado | El Doc 3 lo pide explícitamente al cerrar el ADR-008 y el Doc 4 ya reserva la columna, pero el Doc 5 Bloque 2 nunca lo incorporó. Sin él, `encargos.numero` sería siempre `null` y la app no podría mostrar "Encargo #47". **Hay que enmendar el Doc 5.** |
| Tamaño del bloque | 100 | El Doc 3 lo usa como ejemplo ("del 101 al 200") pero no lo fija. Con ~100 encargos activos por negocio, un bloque dura meses sin conexión; el coste de equivocarse es cosmético (un hueco en la numeración). |
| `siguiente_bloque_numeros` | Guarda el **próximo número libre**, no el índice del bloque | Así el tamaño del bloque es un parámetro de runtime: cambiarlo mañana no solapa ni deja huecos en lo ya entregado. El nombre de la columna queda algo impreciso. |
| `ENTREGADO` | **Terminal**: no se pausa, ni se cancela, ni se deshace | El PRD acota pausar/cancelar a "antes de ENTREGADO" y "cualquier encargo no entregado"; ningún documento define cómo deshacer una entrega. Lectura literal y la más restrictiva. **Revisable si la UI lo necesita.** |
| Reactivar un `CANCELADO` | El estado destino lo elige quien llama | El PRD dice "a su estado anterior", pero no hay columna para guardarlo — y no hace falta: `PATCH /estado` ya recibe el destino. |
| Advertencias no bloqueantes | `PATCH /estado` devuelve `200` con un arreglo `advertencias` | El invariante 10 permite entregar con saldo pendiente y solo advertir. El formato de error del Doc 5 es exclusivo de 4xx/5xx, así que hacía falta un canal para avisos en un `200`. Pone la regla en el backend en vez de que el Flutter la reimplemente. **Añadido al contrato del Doc 5.** |
| Descuento por encima de la suma | `422` si lo fija el usuario; **ajuste automático** si la suma baja sola | Son las dos mitades del invariante 2. Bloquear el segundo caso dejaría el encargo imposible de arreglar: el usuario no pidió ese cambio, lo provocó borrar un trabajo. |
| `cliente_id` inexistente o de otro negocio | `422 CLIENTE_NO_ENCONTRADO` | Sin comprobarlo, la FK daría un error de Prisma que acabaría en `500`. El payload está bien formado pero referencia algo inválido → 422, no 404 (el 404 es del encargo, no de lo que referencia). |
| Fecha de `fecha_listo` / `fecha_entrega_real` | Reloj del servidor en zona del negocio | **Deuda conocida y anotada en el código.** El Doc 2 habla de "la fecha del dispositivo". Coincide mientras haya conexión, pero con la cola Outbox una transición hecha el lunes sin red y sincronizada el miércoles quedará fechada el miércoles. Al construir el motor de sincronización hay que decidir si el cuerpo acepta la fecha del dispositivo — lo que choca con el invariante 8 — o si se asume el desfase. |

**Hallazgo de implementación:** con este schema, Prisma 5 informa las violaciones de unicidad dentro de una transacción interactiva con `meta.target: null` y el mensaje *"Unique constraint failed on the (not available)"*, así que **el error no dice qué restricción falló**. Como `encargos` tiene dos (la llave primaria y `UNIQUE (negocio_id, numero)`), hay que preguntarle a la base cuál fue: si existe otro encargo con ese número, es la del número (`422`); si no, es la primaria (que pasa por la lógica de idempotencia). La consulta extra solo ocurre tras un conflicto, nunca en el camino normal.

**Fuera de alcance hasta Sprint 3-4** (Doc 11): Objetos, Trabajos, Materiales, Pagos, Notas y Fotos, y con ellos el detalle anidado de `GET /encargos/{id}`. `recalcular()` y `sumas()` ya están escritos y probados para ese momento: hoy las sumas son 0 porque no hay forma de crear hijos, pero las consultas ya son las definitivas y excluyen los tombstones.

## Pendiente

- Sprint 3-4: Objetos, Trabajos (con y sin catálogo), Materiales, Pagos, Notas y Fotos — todos bajo `/encargos/{id}/...`.
- Doc 5 Bloque 2: 4 endpoints sin implementar — `GET/PATCH /negocio` y `POST/DELETE /dispositivos/fcm-token`.
- **Enmiendas pendientes al Doc 5**, por orden de urgencia (la app Flutter se escribirá contra el documento, no contra el código):
  1. `POST /encargos/reservar-bloque-numeros` — el endpoint existe en el código y lo pide el Doc 3, pero no está en el Doc 5.
  2. El `id` opcional en los `POST` y su respuesta `200` idempotente.
  3. El arreglo `advertencias` en la respuesta de `PATCH /encargos/{id}/estado`.
  4. Los códigos `422` nuevos: `TELEFONO_INVALIDO`, `SERVICIO_PRECIO_INVALIDO`, `MONTO_INVALIDO`, `FECHA_INVALIDA`, `ENCARGO_DESCRIPCION_VACIA`, `ENCARGO_NUMERO_EN_USO`, `TRANSICION_INVALIDA`, `CLIENTE_NO_ENCONTRADO`.
- Elegir proveedor de hosting y habilitar `deploy.yml` (Doc 3 Bloque 5).

## Códigos de error no de negocio

El Doc 5 define los códigos `422` del catálogo de negocio; los demás se fijan en el filtro global, una sola vez:

| HTTP | `codigo` |
|---|---|
| 400 | `SOLICITUD_INVALIDA` |
| 401 | Los seis códigos de autenticación de la tabla anterior; `NO_AUTENTICADO` como genérico |
| 404 | `NO_ENCONTRADO` (también para recursos de otro negocio, Doc 5) |
| 429 | `LIMITE_EXCEDIDO` |
| 500 | `ERROR_INTERNO` |

## Stack definido

- **Framework:** NestJS
- **Base de datos:** PostgreSQL
- **ORM:** Prisma
- **Notificaciones:** Firebase Cloud Messaging
- **Almacenamiento:** Cloudflare R2

## Setup local

```bash
cp .env.example .env   # completar credenciales; DATABASE_URL ya apunta al rol gestor_app
npm install
docker compose -f ../infra/docker-compose.yml up -d
npm run prisma:migrate
npm run prisma:seed
npm run start:dev      # API en http://localhost:3000/api/v1, docs en /api/docs
npm test               # unitarios
npm run test:e2e       # e2e contra el Postgres local (Firebase reemplazado por un doble)
```
