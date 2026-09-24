# syntax=docker/dockerfile:1
# Imagen del backend para hosting gestionado (Doc 3 Bloque 5: Railway/Render/
# Fly.io aceptan Dockerfile, así que la imagen es independiente del proveedor).
# Las migraciones NO corren acá: las aplica el pipeline con `prisma migrate
# deploy` antes de cada despliegue (Doc 8 Bloque 1).

# --- 1. Dependencias (incluye devDependencies para compilar) ---------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# El schema tiene que estar antes de `npm ci`: el postinstall de @prisma/client
# genera el cliente para esta plataforma (linux-musl).
COPY prisma ./prisma
RUN npm ci

# --- 2. Build -------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- 3. Runtime mínimo, sin herramientas de build, usuario sin privilegios --
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./
USER app
EXPOSE 3000
CMD ["node", "dist/main"]
