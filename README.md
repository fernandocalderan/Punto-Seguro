# Punto Seguro - IEI + Lead Engine

Plataforma end-to-end para:

- Diagnostico IEI en `/diagnostico`.
- Resultado en `/resultado`.
- Solicitud de propuesta en `/solicitar-propuesta`.
- Verificacion OTP (Twilio Verify) antes de crear lead.
- Distribucion de lead hasta 2 proveedores.
- Panel admin para proveedores y leads.

## Contexto recomendado para ChatGPT (Fuentes)

Si quieres cargar contexto eficaz en la seccion **Fuentes**, usa este pack:

1. `docs/AI_CONTEXT.md`
2. `docs/CONTRACTS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/OPS.md`
5. `docs/GUARDRAILS.md`

`README.md` queda como entrada general para humanos. Los contratos y reglas sensibles viven en `docs/`.

## Requisitos

- Node.js 20+ (probado con Node 22)

## Arranque rapido

1. Instalar dependencias:

```bash
npm install
```

2. Crear entorno local:

```bash
cp .env.example .env
```

3. Arrancar servidor:

```bash
npm run dev
```

Servidor local: `http://localhost:3000`

## Variables clave

Minimo recomendado:

- `ADMIN_PASSWORD`
- `OTP_JWT_SECRET`

En produccion:

- `DATABASE_URL` (persistencia real)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- `RESEND_API_KEY` (si quieres envio real de emails)

Sin `RESEND_API_KEY` el sistema imprime emails en consola.

## Persistencia

Modo JSON (sin `DATABASE_URL`):

- `data/providers.json`
- `data/leads.json`
- `data/events.json`

Modo Postgres (con `DATABASE_URL`):

- tablas `providers`, `leads`, `events`

Comandos DB:

```bash
npm run db:schema
npm run db:migrate
```

## Seed demo

```bash
npm run seed
```

Solo proveedores:

```bash
SEED_SKIP_LEAD=true npm run seed
```

## Rutas clave

- `/`
- `/diagnostico`
- `/resultado`
- `/solicitar-propuesta`
- `/confirmacion`
- `/proveedores`
- `/admin/login`
- `/admin/providers`
- `/admin/leads`

## Deploy (Vercel)

- `vercel.json` enruta todo via `api/index.js`.
- `includeFiles` ya incluye html/js/css/admin/blog + `Motor-IEI/**` + `assets/**`.
- Con `DATABASE_URL` ausente en Vercel, la persistencia sera efimera.
