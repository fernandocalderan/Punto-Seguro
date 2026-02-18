# Architecture Map

## Frontend pages

- `index.html`: landing + conversion CTA to `/diagnostico`.
- `evaluador.html`: diagnostic shell + stepbar + form containers.
- `resultado.html`: result UI skeleton.
- `solicitar-propuesta.html`: lead form + OTP modal.
- `confirmacion.html`: post-submit state.
- `admin/leads.html`, `admin/providers.html`, `admin/login.html`: admin area.

## Frontend scripts

- `js/iei-evaluador-user-v1.js`
  - Loads `Motor-IEI/iei_questions_premium.json`.
  - Imports ESM engine `Motor-IEI/calculateIEI.js`.
  - Exposes `window.calcularRiesgo`.
  - Persists `puntoSeguro.latestEvaluation`.

- `js/resultado.js`
  - Reads latest evaluation.
  - Computes narrative, priority and drivers.
  - Persists `puntoSeguro.evaluationSummary` and `puntoSeguro.intent`.
  - Routes user to `/solicitar-propuesta`.

- `js/lead-form.js`
  - Reads evaluation + intent context.
  - Handles OTP modal and 6-digit code UX.
  - Requests OTP start/check/token.
  - Sends lead only after verification token.

- `js/admin/leads.js`
  - Fetches metrics and leads from admin APIs.
  - Applies filters and renders table/detail.
  - Performs patch/assign/reassign/anonymize actions.

## Backend

- `server.js`
  - Express app + static file serving.
  - Route-to-file map for public pages.
  - API endpoints:
    - events
    - OTP (`/api/otp/start`, `/api/otp/check`, `/api/otp/token`)
    - leads (`/api/leads`)
    - admin CRUD and lead actions
  - Enforces OTP verification token gate before lead creation.

- `lib/leadService.js`
  - Creates lead.
  - Validates/updates statuses.
  - Assigns providers.
  - Dispatches emails.

- `lib/models.js`
  - Canonical model normalization and derived fields.
  - Risk and pricing derivations.
  - Commercial scoring (CIS) derivation.

- `lib/email.js`
  - Provider and user transactional templates.
  - Subject lines and summary extraction.
  - Resend integration with console fallback.

- `lib/repositories*.js`
  - JSON and Postgres repositories.
  - `createRepositories` picks backend by env config.

## Data and state

- JSON mode files in `data/`.
- Postgres mode tables: `providers`, `leads`, `events`.
- SessionStorage used to bridge multi-page funnel state.

