# Guardrails for Changes

Use this before touching code.

## Must-not-break rules

- Do not bypass OTP in lead creation.
- Do not remove `verificationToken` validation in `/api/leads`.
- Keep `/resultado` to `/solicitar-propuesta` funnel contracts intact.
- Keep case-sensitive static paths (example: `/Motor-IEI/...`).
- Keep admin IDs used by `js/admin/leads.js`.

## High-risk files

- `js/resultado.js`: drives intent, summary, and lead handoff.
- `js/lead-form.js`: OTP flow and lead submit.
- `server.js`: API contracts, OTP gate, anti-fraud.
- `lib/models.js`: derived scoring and lead schema.
- `lib/email.js`: provider/user transactional messaging.

## IEI integrity rules

- Questions and engine must stay aligned by ID/block.
- If question IDs change, update:
  - JSON question file
  - engine ID map
  - factor text mappings
  - any downstream rules depending on factor text

## Text-sensitive behavior

- Result plan quality depends on factor wording patterns.
- Email provider CIS is intentional and provider-only.
- User email must remain clear, non-alarmist, and without CIS.

## Safety checklist before merge

1. No 404 on static assets used by active pages.
2. No console errors on `/diagnostico`, `/resultado`, `/solicitar-propuesta`.
3. OTP start/check/token sequence succeeds.
4. Lead creation blocked without valid token.
5. Admin leads table/detail still works.
6. Existing sessionStorage keys still readable.

