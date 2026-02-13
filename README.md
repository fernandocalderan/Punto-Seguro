# Punto Seguro - Motor de Leads (Alarmas)

Implementación local end-to-end para captura y distribución de leads basada en IEI™:

- Evaluación IEI™ (`/diagnostico`) reutilizando el evaluador existente.
- Resultado (`/resultado`) con Índice IEI™ (nivel de exposición) y recomendaciones generales.
- CTA a formulario de lead (`/solicitar-propuesta`) con consentimiento GDPR.
- Asignación automática a hasta 2 proveedores por zona/tipo/rotación/cupo.
- Envío de emails a proveedores y confirmación a usuario.
- Panel mínimo (`/admin`) para proveedores y leads.
- Eventos y métricas persistidas en JSON o Postgres (según configuración).

## Requisitos

- Node.js 20+ (probado con Node 22)

## Configuración

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` (puedes partir de `.env.example`):

```bash
cp .env.example .env
```

3. Define al menos:

- `ADMIN_PASSWORD`
- `DATABASE_URL` en producción (obligatorio para persistencia real en Vercel)

4. Persistencia:

- Sin `DATABASE_URL`: usa JSON local en `data/`.
- Con `DATABASE_URL`: usa Postgres para `providers`, `leads` y `events`.
- En producción (Vercel) debes definir `DATABASE_URL`; sin esta variable la persistencia será efímera.

Email:

- En producción: configura `RESEND_API_KEY` para enviar correos reales vía Resend.
- Sin `RESEND_API_KEY`: el servidor imprime en consola el outbox (modo desarrollo).

## Postgres (persistencia permanente)

1. Define `DATABASE_URL` en `.env` o variables de entorno.
2. Aplica esquema completo (instalación nueva):

```bash
npm run db:schema
```

3. Aplica migración incremental (base ya existente):

```bash
npm run db:migrate
```

Alternativa con `psql`:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Incremental con `psql`:

```bash
psql "$DATABASE_URL" -f migrations/20260211_01_leads_decision_fields.sql
```

Esto crea tablas desde `db/schema.sql`:

- `providers`
- `leads`
- `events`

Nota SSL:

- Por defecto el cliente usa SSL con `rejectUnauthorized: false`.
- Si tu Postgres local no usa SSL, define `PG_SSL_DISABLE=true`.
- Si tu `DATABASE_URL` trae `sslmode=require` (ej. Neon), puedes cambiarlo a `sslmode=verify-full` en la URL (misma credencial, solo cambia el modo).

### Despliegue en Vercel

- El proyecto incluye `vercel.json` para enrutar todas las rutas y API a Express.
- En Vercel define `ADMIN_PASSWORD`.
- `DATABASE_URL` es obligatorio en Vercel para persistencia permanente de leads/proveedores/eventos.
- Variables opcionales: SMTP y `PG_SSL_DISABLE` (solo si tu proveedor lo requiere).
- Con `DATABASE_URL` activo, los leads/proveedores/eventos permanecen tras redeploys.

## Seed demo

Carga 5 proveedores demo (Barcelona/Castelldefels/Gavà/Viladecans) y 1 lead demo:

```bash
npm run seed
```

Si quieres cargar solo proveedores (sin lead demo):

```bash
SEED_SKIP_LEAD=true npm run seed
```

## Ejecutar local

```bash
npm run dev
```

Servidor: `http://localhost:3000`

## Rutas clave

- `/` home
- `/diagnostico` quiz
- `/resultado` resultado
- `/solicitar-propuesta` formulario lead
- `/confirmacion` confirmación
- `/proveedores` captación B2B
- `/admin/login` acceso admin
- `/admin/providers` CRUD proveedores
- `/admin/leads` listado + detalle leads
- `/privacidad`, `/terminos`, `/cookies`

## Datos persistentes

Modo JSON (sin `DATABASE_URL`):

- `data/providers.json`
- `data/leads.json`
- `data/events.json`

Modo Postgres (con `DATABASE_URL`):

- tablas `providers`, `leads`, `events`
  
