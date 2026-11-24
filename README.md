# Rueda

Aplicación web para gestionar el reparto anual de grupos y materias en los departamentos de un instituto de educación secundaria.

## Características principales

- **Tres perfiles de acceso** sin contraseñas (enlaces anuales y códigos cortos): Jefatura de estudios, Jefe/a de departamento y Profesorado.
- **Motor de rondas automáticas** con pausa, reanudación, ajuste y fase manual final.
- **Actualizaciones en tiempo real** mediante Server-Sent Events (SSE).
- **Importación CSV** de profesorado, participantes y grupos (ejemplos en [`datos-prueba/`](datos-prueba/)).
- **Acta imprimible** y copias de seguridad automáticas de la base de datos SQLite.

## Stack técnico

- **Framework**: SvelteKit 2 + Svelte 5 (`@sveltejs/adapter-node`), TypeScript (`strict`), Tailwind CSS v4.
- **Base de datos**: SQLite (`better-sqlite3`) + Drizzle ORM.
- **Tests**: Vitest (+ `fast-check`) y Playwright.
- **Despliegue**: Docker multietapa (`node:22-bookworm-slim`) y Docker Compose.

## Requisitos

- **Node.js 22** (ver `.nvmrc`) y `npm`.
- Para despliegue con contenedores: Docker y Docker Compose.

## Arranque en local

```bash
# 1. Instalar dependencias
npm ci

# 2. Copiar variables de entorno
cp .env.example .env

# 3. Arrancar en modo desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`. Al arrancar por primera vez con una base de datos vacía, el servidor genera un enlace de configuración inicial (`/setup/<token>`) en los logs de consola.

## Despliegue con Docker

```bash
cp .env.example .env
# Ajusta ORIGIN y, si procede, las variables SMTP_* en .env
docker compose up -d --build
```

Los datos persistentes (SQLite y copias de seguridad) se guardan en el volumen `./data:/data`. El endpoint `/health` permite comprobar el estado del servicio.

## Variables de entorno

Consulta [`.env.example`](.env.example) para la lista completa:

| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `ORIGIN` | URL pública de la aplicación | `http://localhost:5173` |
| `DATABASE_PATH` | Ruta al archivo SQLite | `./data/app.db` |
| `TZ` | Zona horaria | `Europe/Madrid` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Configuración SMTP opcional para el envío de enlaces | *(desactivado)* |

## Scripts útiles

| Comando | Acción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run check` | Comprobación de tipos con `svelte-check` |
| `npm run lint` | Comprobación de ESLint y formato Prettier |
| `npm run format` | Formateo automático con Prettier |
| `npm test` | Tests unitarios y de integración (Vitest) |
| `npm run test:e2e` | Tests end-to-end (Playwright) |
| `npm run db:generate` | Generar migraciones de Drizzle |
| `npm run db:migrate` | Aplicar migraciones de Drizzle |

## Documentación

La especificación funcional y técnica completa está disponible en [`especificacion-reparto-grupos.md`](especificacion-reparto-grupos.md).

## Licencia

Distribuido bajo licencia [MIT](LICENSE).
