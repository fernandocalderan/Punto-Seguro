# AI Context - Punto Seguro

This file is optimized for LLM context loading.

## Product in one paragraph

Punto Seguro is a web funnel that evaluates exposure to intrusion with IEI, shows a result page with priorities and factors, and converts users into leads that are verified by SMS OTP before creation. Leads are assigned to up to 2 providers and managed in an admin panel.

## Main business objective

Maximize qualified lead conversion without breaking trust:

- Keep IEI scoring stable.
- Keep UX smooth (few steps, clear CTA).
- Protect lead quality (OTP + consent + anti-fraud).
- Give providers commercially useful, pre-qualified lead context.

## Core user flow

1. User opens `/diagnostico`.
2. Questionnaire is rendered from JSON (data-driven).
3. Engine computes IEI score and level.
4. Evaluation is saved to `sessionStorage["puntoSeguro.latestEvaluation"]`.
5. User views `/resultado` and can request proposals.
6. Result page saves intent + summary in sessionStorage.
7. User submits `/solicitar-propuesta`.
8. OTP start/check/token runs.
9. Lead is created only with valid verification token.
10. Lead is assigned and emails are sent (provider + user).

## Source of truth by area

- IEI questions: `Motor-IEI/iei_questions_premium.json` (active), `Motor-IEI/iei_questions_v1.json` (legacy/historical).
- IEI algorithm: `Motor-IEI/calculateIEI.js`.
- Quiz render + bridge: `js/iei-evaluador-user-v1.js`.
- Result logic and CTA: `js/resultado.js`.
- Lead form + OTP modal flow: `js/lead-form.js` + `solicitar-propuesta.html`.
- API + routing + OTP + lead gate: `server.js`.
- Lead creation and dispatch: `lib/leadService.js`.
- Lead/provider schema and derived scores: `lib/models.js`.
- Email templates: `lib/email.js`.

## Important runtime contracts

- SessionStorage keys:
  - `puntoSeguro.latestEvaluation`
  - `puntoSeguro.evaluationSummary`
  - `puntoSeguro.intent`
  - `puntoSeguro.lastLead`
- OTP gate:
  - Frontend calls `/api/otp/start`, `/api/otp/check`, `/api/otp/token`.
  - `/api/leads` requires `verificationToken` and rejects bypass.

## Current lead quality signals

Lead object now stores:

- `phone_verified`
- `otp_started_at`
- `otp_verified_at`
- `otp_response_seconds`
- `commercial_score` (CIS, 0..100)
- `commercial_tier` (`Premium`, `Alta`, `Media`, `Baja`)

CIS is shown only to providers in email. User email must not show CIS.

## Before changing anything

Read in this order:

1. `docs/GUARDRAILS.md`
2. `docs/CONTRACTS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/OPS.md`

