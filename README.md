# Punto Seguro - Motor de Leads (Alarmas)

Implementación local end-to-end para captura y distribución de leads:

- Diagnóstico (`/diagnostico`) reutilizando el evaluador existente.
- Resultado (`/resultado`) con nivel de riesgo y recomendaciones generales.
- CTA a formulario de lead (`/solicitar-propuesta`) con consentimiento GDPR.
- Asignación automática a hasta 2 proveedores por zona/tipo/rotación/cupo.
- Envío de emails a proveedores y confirmación a usuario.
- Panel mínimo (`/admin`) para proveedores y leads.
- Eventos y métricas persistidas en `data/events.json`.

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

SMTP es opcional. Si no se configura, los correos se guardan en `data/email-outbox.log`.

## Seed demo

Carga 5 proveedores demo (Barcelona/Castelldefels/Gavà/Viladecans) y 1 lead demo:

```bash
npm run seed
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

- `data/providers.json`
- `data/leads.json`
- `data/events.json`
- `data/email-outbox.log`
