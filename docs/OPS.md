# Ops and Deployment

## Local commands

Install and run:

```bash
npm install
npm run dev
```

Database helpers:

```bash
npm run db:schema
npm run db:migrate
```

Seed demo:

```bash
npm run seed
```

## Environment variables

Core:

- `ADMIN_PASSWORD`
- `OTP_JWT_SECRET`
- `MAX_PROVIDERS_PER_LEAD` (default 2)

OTP / Twilio:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- `OTP_TOKEN_TTL_SECONDS` (default 600)
- `OTP_VERIFIED_WINDOW_MS` (default 10 min)
- `OTP_RATE_WINDOW_MS` (default 1h)
- `OTP_RATE_LIMIT_IP` (default 5)
- `OTP_RATE_LIMIT_PHONE` (default 3)
- `OTP_SPAIN_ONLY` (default true; use `0` to disable)

Persistence:

- `DATABASE_URL` (required for durable prod data)
- `PG_SSL_DISABLE` (optional)

Email:

- `RESEND_API_KEY` for real delivery
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`

## Runtime modes

Without `DATABASE_URL`:

- JSON storage in `data/`.
- Fine for local testing only.

With `DATABASE_URL`:

- Postgres repositories and persistent production data.

Without `RESEND_API_KEY`:

- Emails are logged in console.

## Vercel notes

- Routing goes through `api/index.js` (Express entry).
- `vercel.json` `includeFiles` must include static assets and app files.
- Current config includes:
  - `Motor-IEI/**`
  - `assets/**`
  - `js/**`, `css/**`, `styles/**`
  - `admin/**`, `blog/**`
  - root html and images

## Quick production smoke checklist

1. `GET /Motor-IEI/iei_questions_premium.json` returns 200.
2. `GET /Motor-IEI/calculateIEI.js` returns 200.
3. `GET /assets/img/iei-preview.svg` and example PDF return 200.
4. Lead form OTP flow works end-to-end.
5. Direct `POST /api/leads` without token returns 403.
6. Admin login and leads pages load.

