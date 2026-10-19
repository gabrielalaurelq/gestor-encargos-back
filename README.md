# Backend — NestJS

**Estado:** 🔵 En desarrollo — Sprint 0 / Fase 2 (autenticación y multitenancy), ver `docs/11-roadmap.md`

Documentos base, todos aprobados: Doc 3 (Arquitectura), Doc 4 (Base de Datos), Doc 5 (API, **v1.4**) y Doc 8 (Backend, **v1.1**) — ambos enmendados desde el código.

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

### Sprint 3-4 — Hijos del agregado: Objetos, Trabajos, Pagos y Notas

9 endpoints bajo `/encargos/{id}/...`, nunca como recurso suelto: es la regla de consistencia del Doc 2 llevada a la superficie de la API. **Es el primer sitio donde `precio_total` y `saldo_pendiente` se mueven de verdad** — hasta aquí las sumas del agregado eran siempre 0.

- `domain/` — `ObjetoRecibido`, `Trabajo` (dos constructores: `desdeServicio` y `personalizado`), `Pago` y `Nota`. Ni `Pago` ni `Nota` exponen `aplicar()`: su inmutabilidad se expresa como **ausencia de métodos**, no como una validación que se pueda olvidar.
- `GET /encargos/{id}` ya devuelve el detalle anidado que el Doc 5 promete (`objetos`, `trabajos`, `pagos`, `notas`). Las cinco consultas van en una transacción para que la foto sea coherente: sin ella, un pago registrado a mitad de la lectura podría salir en la lista pero no en el `saldo_pendiente` ya leído.

**La decisión central: `mutarAgregado()`.**

El Doc 8 Bloque 1 describe un único `save(encargo)` que reescribe el agregado completo en una transacción. Se implementó distinto, y a propósito: **reescribir hijos que no cambiaron movería su `actualizado_en`, que es exactamente lo que usa el delta sync del Doc 5.** Agregar un pago haría que todos los dispositivos se bajaran de nuevo todos los trabajos y objetos del encargo. No es un detalle de rendimiento: es un efecto incorrecto sobre el motor de sincronización.

En su lugar, `EncargoRepository.mutarAgregado(encargoId, fn)` abre una transacción, carga la raíz, ejecuta `fn` —que escribe **solo** el hijo que cambió— y al salir **siempre** recalcula los derivados y los persiste. Que el recálculo viva ahí y no en cada caso de uso es lo que hace imposible escribir un hijo y olvidarse de la raíz. **Pendiente: enmendar el Doc 8** con este desvío y su motivo.

**Decisiones tomadas en este bloque:**

| Decisión | Elección | Motivo |
|---|---|---|
| Respuesta de las escrituras de hijos | El hijo + los 3 campos calculados de la raíz (`{trabajo: {…}, encargo: {precio_total, descuento, saldo_pendiente}}`) | Es lo que pide el Doc 5 Bloque 3 ("el Trabajo creado y el `precio_total` ya recalculado") sin inflar la respuesta: la app ya tiene el resto del encargo en local. `POST /notas` devuelve solo la nota — no afecta a ningún campo calculado. |
| Idempotencia de los hijos | Helper propio (`application/crear-hijo.ts`), no `crearIdempotente` | En Postgres, un error dentro de una transacción interactiva la deja abortada: la relectura de recuperación de `crearIdempotente` fallaría ahí dentro. La solución es reintentar la transacción completa — en la segunda pasada el pre-chequeo encuentra lo que escribió el otro reintento. La decisión del `409` sí se comparte (`conflictoIdAjeno`), para que el texto y el criterio no se bifurquen. |
| Trabajo desde catálogo | Se **copian** nombre y precio; `servicio_id` queda solo como rastro de procedencia | La no retroactividad del invariante 12 no se comprueba en ningún sitio: es una consecuencia de copiar en vez de referenciar. El test lo verifica subiendo el precio del catálogo *después* de crear el trabajo. |
| `TRABAJO_ORIGEN_AMBIGUO` | `422` si llegan las dos vías (`servicio_id` **y** `descripcion`/`precio`), o ninguna | Se valida en el caso de uso y no en el DTO para que la app distinga "mandaste las dos vías" de "mandaste un campo mal tipado". Código nuevo, no estaba en el Doc 5. |
| Servicio inactivo o de otro negocio | `422 SERVICIO_NO_DISPONIBLE` | PRD módulo 4: un servicio desactivado "deja de ofrecerse para trabajos nuevos". Sin la comprobación, la FK daría un error de Prisma que acabaría en `500`. |
| Objeto vinculado de otro encargo | `422 OBJETO_NO_EN_ENCARGO` | El vínculo es intra-agregado; cruzarlo rompería la regla de consistencia. |
| Origen de pago inválido o inactivo | `422 ORIGEN_PAGO_INVALIDO` | Invariante 5. Mismo motivo que arriba: evitar un `500` por la FK. |
| Borrar un objeto | No borra sus Trabajos ni cambia `precio_total` | La FK es `ON DELETE SET NULL` y el invariante 19 permite un Trabajo sin objeto. |
| Borrado de pagos | Lógico, nunca físico | Invariante 15: el negocio conserva el historial para saber si debe devolver dinero. El tombstone además propaga el borrado por delta sync. |

**Lo que por fin se ejercita:** el ajuste automático del descuento (segunda mitad del invariante 2). Estaba escrito y probado desde Sprint 2, pero nunca se había ejecutado de verdad porque las sumas eran 0. El e2e lo comprueba: con descuento 50 y trabajos de 100 + 10, borrar el de 100 baja el descuento a 10 solo y deja `precio_total` en 0, sin error.

**Fuera de alcance** (Doc 11, Sprint 7): Materiales y Fotografías. Fotos arrastra además las presigned URLs de R2 (Doc 8, Bloque 3), que es un trabajo aparte. Por eso `GET /encargos/{id}` no declara todavía la clave `fotos`: no se promete una clave que hoy siempre estaría vacía.

### `GET /sync` — el pull del motor offline-first (`src/modules/sync/`)

El Doc 5 lo llama *"el endpoint más importante del documento"*. Devuelve todo lo cambiado en el negocio desde `since`, agrupado en las 9 colecciones que fija el Bloque 1. Es una **lectura cross-agregado** —recorre las 9 tablas sin pasar por las raíces—, que el Doc 2 permite explícitamente; por eso el módulo no tiene capa `domain/` con entidades: no sostiene invariantes, solo proyecta filas.

**Hallazgo: el diseño del Doc 5 perdía datos en silencio.** Una sonda contra la base real lo demostró:

```
antes de escribir : 22:24:04.000
actualizado_en    : 22:24:04.003   ← reloj de la ESCRITURA
despues del commit: 22:24:06.013   ← cuando se hizo visible
```

`actualizado_en` lo escribe Prisma con el reloj de la aplicación **en el momento de la escritura**, no en el del commit, así que **el orden de los timestamps no coincide con el orden de visibilidad**. Una sincronización a las `22:24:05` no ve esa fila, devuelve `servidor_timestamp: 22:24:05`, y la próxima pide `>= 22:24:05`: la fila tiene `22:24:04.003` y no vuelve a aparecer nunca. El Doc 5 razonó sobre una carrera parecida —de ahí su instrucción de guardar `servidor_timestamp` y no el máximo `actualizado_en`— pero esa precaución no cubre este caso: el problema no es qué marca guarda el cliente.

**La solución: margen de solape de 10 s.** `servidor_timestamp` = reloj de inicio de la petición **menos 10 s**, y `since` comparado de forma inclusiva (`>=`). El número no es arbitrario: Prisma aborta cualquier transacción interactiva que pase de 5 s, así que la distancia entre una escritura y su commit está acotada ahí; 10 s es el doble, y absorbe además el desfase de reloj si algún día hay más de una instancia del backend. El coste es que cada sincronización reenvía las filas de esos 10 s — y con Last-Write-Wins aplicar dos veces el mismo cambio da el mismo resultado. **El principio: ante cualquier ambigüedad, reenviar; perder es irreversible.**

| Decisión | Elección | Motivo |
|---|---|---|
| Aislamiento de la lectura | `RepeatableRead` para las 9 consultas | Con el `READ COMMITTED` por defecto cada sentencia ve una foto distinta, y el cliente podría recibir un trabajo cuyo encargo no venía en la consulta anterior: un hijo sin padre. Se añadió un parámetro opcional a `PrismaNegocio.transaccion()`. |
| Reloj de referencia | El de la aplicación, no `now()` de Postgres | Es el mismo reloj que escribe `actualizado_en`; mezclarlo con el de la base metería un desfase entre relojes distintos. |
| Las 9 colecciones | Siempre presentes, aunque vengan vacías | `materiales` y `fotos` llegan vacías hasta Sprint 7. El Doc 3 describe un "motor de sincronización genérico" que itera lo que recibe: incluirlas desde ya significa que Sprint 7 no toca el cliente. (Al contrario que en `GET /encargos/{id}`, donde añadir una clave después es aditivo e inofensivo.) |
| Proyecciones | Distintas de las respuestas REST: cada fila lleva sus llaves foráneas | En REST el `encargo_id` va en la URL; acá el cliente recibe listas planas y necesita las FK para reconstruir las relaciones en su base local. |
| Tombstones | Viajan como cualquier otro cambio, con `eliminado_en` | Es la señal para borrar en local (Doc 4, Bloque 3). Las consultas de sync **no** filtran `eliminado_en`, al contrario que las del agregado. |
| Truncamiento | Tope de 500 filas por colección; `servidor_timestamp` no avanza más allá del corte | El `since` inclusivo evita saltarse filas con el timestamp exacto del corte. **Límite conocido:** si 500 filas compartieran el mismo `actualizado_en`, el corte no avanzaría; no puede pasar hoy porque no hay escrituras masivas, y si se añade alguna habrá que pasar a un cursor `(actualizado_en, id)`. |

**Lo que sigue abierto:** si el reloj del servidor salta hacia atrás más que el margen (un ajuste de NTP grande), ningún esquema basado en timestamps aguanta. La solución definitiva sería ordenar por commit real (`xmin` o una secuencia monótona), lo que cambia el contrato del Doc 5 y pide migrar 9 tablas. Anotado, no hecho.

### Negocio propio y dispositivos — los 4 endpoints que faltaban del Doc 5 Bloque 2

Con esto **el Bloque 2 del Doc 5 queda completo**, salvo Materiales y Fotos (Sprint 7).

- **`src/modules/negocio/`** — `GET /negocio` y `PATCH /negocio`. Módulo propio porque Negocio es una raíz independiente (Doc 2 v1.1). Usa `PrismaService` crudo con el `negocioId` de la sesión: `negocios` es la tabla que **define** al tenant, no tiene columna `negocio_id` y queda fuera del alcance de la extensión y de RLS — igual que `AuthRepository` y `NumeracionRepository`.
- **`POST`/`DELETE /dispositivos/fcm-token`** viven en el módulo **`auth`**, no en uno propio: la fila de `dispositivos` **es** la sesión de ese dispositivo. Auth gobierna su ciclo de vida (la crea en el login, la borra en el logout) y el token FCM es una columna de esa misma fila; partir la propiedad significaría dos dueños escribiendo la misma fila. `Dispositivo` tampoco es un agregado del Doc 2 — se añadió en el Doc 4 v1.3 como soporte de la sesión.

| Decisión | Elección | Motivo |
|---|---|---|
| `GET /negocio` expone `plan` y `plan_vence_en` | Sí | La app los necesita para el feature-gating de las funciones premium (Doc 10, Bloque 2). El `PATCH` **no** los toca: los mueve la pasarela de pago. |
| `google_uid` y `siguiente_bloque_numeros` | No se exponen | El primero es el identificador del proveedor de identidad; el segundo es el contador interno de numeración, que ya tiene su propio endpoint. |
| `nombre_negocio` vacío | Equivale a quitarlo (`null`) | El campo es opcional y nace en `null` (Doc 5, Bloque 1). Al contrario que el nombre de un Cliente, que es obligatorio y da `422`. |
| Token FCM ya usado **en el mismo negocio** | Se le suelta a la fila anterior y se asigna | `fcm_token` es único **globalmente**, y Firebase reasigna el mismo token cuando la app se reinstala. Sin esta limpieza, reinstalar rompería las notificaciones. |
| Token FCM usado por **otro negocio** | `409 FCM_TOKEN_EN_USO` | RLS no deja ver ni limpiar la fila ajena —el rol de la aplicación no es superusuario, por diseño— y el `UNIQUE` es global. Pasa si el usuario anterior de ese teléfono nunca cerró sesión; se resuelve cuando esa sesión antigua hace logout. Las alternativas serían renunciar a la unicidad del token (dos negocios recibiendo las notificaciones del mismo teléfono) o a RLS. |
| Dispositivo cuya fila ya no existe | `401 SESION_INVALIDA` | **Lo encontró el e2e:** daba `500`. El access token sigue siendo válido hasta vencer porque el `AuthGuard` no consulta la base en cada petición (por diseño), así que un dispositivo que cerró sesión puede seguir llamando ~30 min. No es un error interno: la sesión dejó de existir. |

### Historial del cliente — lo que quedó pendiente del Sprint 1

`GET /clientes/{id}/encargos` (PRD módulo 1) y el resumen de Historial dentro de `GET /clientes/{id}` (PRD módulo 18). Se dejaron en Sprint 1 porque dependían de Encargos y nunca se retomaron hasta ahora.

- **`GET /clientes/{id}/encargos`** vive en el módulo **`encargos`** (`ClienteEncargosController`), aunque la ruta cuelgue de `/clientes`: lo que devuelve son encargos, y `EncargosModule` ya importa `ClientesModule` — declararla en `clientes` crearía una dependencia circular.
- **El resumen** es un puerto de consulta propio en `clientes` (`HistorialClienteConsulta`), no un método de `ClienteRepository`: no reconstituye el agregado ni sostiene invariantes, solo proyecta — el mismo criterio que el módulo `sync`. Las tres consultas van en una transacción para que los tres números sean una foto coherente.

| Decisión | Elección | Motivo |
|---|---|---|
| Paginación de `/clientes/{id}/encargos` | Paginado, mismo formato del Doc 5 Bloque 4 | Elegido por el usuario: el PRD 18 contempla clientes con 100+ encargos. |
| Orden | `creado_en` descendente, `id` como desempate | Un historial se lee de lo último a lo primero. El desempate hace estable la paginación por offset (se añadió también al orden por fecha acordada de `GET /encargos`). |
| Cliente inexistente vs. sin encargos | `404` vs. `200` con lista vacía | Con solo el filtro `cliente_id` de `GET /encargos` ambos casos se verían iguales. |
| Forma del resumen | `historial: {total_encargos, total_pagado, ultimo_encargo_en}`, **solo** en la ficha | Los tres números del PRD 18. En el listado costaría tres consultas por fila. |
| `total_pagado` | Pagos no eliminados, **incluidos** los de encargos cancelados | PRD 18, casos extremos: el dinero ingresó (mismo criterio que Caja diaria). |
| `ultimo_encargo_en` | `creado_en` del encargo más reciente (reloj del **servidor**) | El encargo no tiene otra fecha de alta. Un encargo creado offline quedará con la fecha en que sincronizó; para "Última visita" el desfase es tolerable, y evitarlo exigiría una columna de hecho nueva en el Doc 4. |

## Pendiente

### Fechas de hecho: las pone el dispositivo

**Esto corrige un desvío mío, no resuelve una ambigüedad de los documentos.** Venía anotando las fechas como "deuda a decidir", pero los documentos nunca estuvieron en duda:

- **Doc 2, invariante 4:** *"`pago.fecha` es siempre la fecha del dispositivo al momento del registro — nunca editable ni retroactiva."*
- **Doc 2, reglas 3-4:** *"se asigna `fecha_listo = hoy` (fecha del dispositivo)."*
- **PRD, módulo 5:** *"su fecha es siempre la fecha actual del dispositivo (automática, no editable) — igual que `fecha_listo` y `fecha_entrega_real`."*

Yo había implementado el reloj del servidor en tres sitios donde los documentos piden el del dispositivo. Y el invariante 8 —*"nunca son editables manualmente"*— no lo impedía: dice que el **usuario** no puede teclear la fecha, no que el reloj deba vivir en el servidor. Las dos cosas conviven: el dispositivo manda la fecha que calculó solo y la UI nunca la expone.

`POST /pagos`, `POST /notas` y `PATCH /estado` aceptan ahora un campo `fecha` opcional (`AAAA-MM-DD`). Si no viene, la pone el servidor — así la API sigue siendo usable desde Swagger o `curl`.

**La distinción que conviene no perder** (no está en ningún documento, y es la que evita el error peligroso):

| Tipo de fecha | Reloj | Por qué |
|---|---|---|
| **Hechos del negocio** — `pago.fecha`, `fecha_listo`, `fecha_entrega_real`, `nota.fecha` | **Dispositivo** | Son hechos del mundo real. El dispositivo sabe cuándo ocurrieron; el servidor solo sabe cuándo se enteró. Es lo que hace correcta la cola Outbox: un pago del lunes sincronizado el miércoles queda fechado el lunes, que es lo que la Caja diaria necesita para agrupar bien. |
| **Metadatos de sincronización** — `creado_en`, `actualizado_en` | **Servidor, siempre** | Son maquinaria del motor de sync. Si el cliente pudiera fijar `actualizado_en`, un teléfono con el reloj adelantado ganaría todos los conflictos de Last-Write-Wins para siempre. |

Validación (`resolverFechaDeHecho` en `shared/domain/fecha.ts`): hasta **1 día** en el futuro —absorbe el desfase de zona y un reloj de móvil algo adelantado— y hasta **90 días** en el pasado, el mismo horizonte que la purga de tombstones del Doc 4. Fuera de rango → `422 FECHA_FUERA_DE_RANGO`, con el rango aceptado en los detalles.

**Lo que se acepta a cambio:** un teléfono con el reloj mal puesto producirá fechas malas y descuadrará la Caja diaria del negociante. La tolerancia de 1 día acota el futuro, pero no lo elimina. Y la fecha pasa a ser falsificable por el dueño del negocio sobre sus propios datos — sin riesgo entre negocios (RLS y el `negocioId` de la sesión lo impiden); falsear tus propias fechas es un problema de tu contabilidad, no de seguridad. No se puede acotar el pasado contra la creación del encargo, que sería lo natural, porque `creado_en` es del servidor: un encargo creado sin conexión tendría `creado_en` **posterior** a la fecha real de su propio pago.
- Sprint 5: Dashboard, Dictado por voz (STT), WhatsApp nivel gratuito.
- **Orden acordado para cerrar el backend del MVP (2026-10-19):** ~~A. historial del cliente~~ → B. Materiales → C. `GET /buscar` → F. `PurgaSoftDeleteJob` + `RevisarVencimientosPlanJob` → D. Fotos (R2 + URLs prefirmadas) → E. `NotificacionesService` (FCM) + `EvaluarRecordatoriosJob`.
- **Caja diaria, Balance de Carga y Calendario no tienen endpoint propio, por diseño** (confirmado con el usuario): el Doc 5 no los define y su Bloque 4 explica por qué — la app es offline-first y las calcula sobre Drift con lo que trae `/sync`. Un endpoint de servidor duplicaría la lógica y daría cifras distintas a las locales sin conexión.
- **Documentos al día:** el Doc 5 está en **v1.4** y el Doc 8 en **v1.1**, ambos enmendados desde el código (`docs/`, sin commitear). Cada sprint nuevo probablemente aporte otra enmienda: conviene hacerlas al cerrar el sprint, no al final, porque el Doc 5 es el contrato contra el que se escribirá la app Flutter.
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
