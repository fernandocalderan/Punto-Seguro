# Contracts and Payloads

## 1) SessionStorage contracts

### `puntoSeguro.latestEvaluation`

Written in `js/iei-evaluador-user-v1.js`, consumed in `js/resultado.js` and `js/lead-form.js`.

Minimum shape:

```json
{
  "model_version": "IEI-user-v1",
  "risk_score": 35,
  "risk_level": "MODERADA",
  "tipo_inmueble": "vivienda",
  "factores_top": [
    { "texto": "Sin deteccion rapida", "text": "Sin deteccion rapida", "puntos": 83 }
  ],
  "confidence_score": 0.82,
  "generated_at": "2026-02-18T12:00:00.000Z"
}
```

### `puntoSeguro.evaluationSummary`

Written in `js/resultado.js`, updated in `js/lead-form.js`.

Contains result summary, factors/drivers, priority, and metrics used in lead flow.

### `puntoSeguro.intent`

Written in `js/resultado.js` on CTA click to proposals.

Used in lead form to prefill urgency/plazo context.

### `puntoSeguro.lastLead`

Written in `js/lead-form.js` after successful lead creation.

Used by confirmation page.

## 2) API contracts

### `POST /api/otp/start`

Request:

```json
{ "phone": "+34600111222" }
```

Responses:

- `200 { "ok": true }`
- `400 invalid_phone`
- `400 unsupported_country` (if Spain-only guard active)
- `429 otp_rate_limited_ip | otp_rate_limited_phone`
- `503 otp_not_configured`

### `POST /api/otp/check`

Request:

```json
{ "phone": "+34600111222", "code": "123456" }
```

Response:

```json
{ "ok": true, "verified": true }
```

### `POST /api/otp/token`

Request:

```json
{ "phone": "+34600111222" }
```

Response:

```json
{ "ok": true, "token": "jwt..." }
```

### `POST /api/leads`

Requires `verificationToken` in body. Without it, backend must return `403 phone_not_verified`.

Payload includes user data + IEI context. Backend normalizes phone and validates token purpose and phone match.

## 3) Lead model fields that now matter

From `lib/models.js`:

- `risk_level`, `risk_score`
- `phone_verified`
- `otp_started_at`
- `otp_verified_at`
- `otp_response_seconds`
- `commercial_score`
- `commercial_tier`
- `lead_score`, `ticket_estimated_eur`, `price_eur`

## 4) Email contracts

From `lib/email.js`:

- Provider email shows:
  - IEI level/score
  - phone verified marker
  - CIS (`commercial_score` + `commercial_tier`) when present
  - top 3 reasons
- User email shows:
  - IEI summary
  - top reasons + actions
  - no CIS

## 5) Admin leads page critical IDs (do not rename)

Used by `js/admin/leads.js`:

- `#metrics`
- `#status-filter`
- `#leads-table`
- `#lead-detail`
- `#lead-detail-content`
- `#manual-provider-primary`
- `#manual-provider-secondary`
- `#manual-note`
- `#assign-manual-btn`
- `#reassign-auto-btn`
- `#anonymize-btn`
- `#anonymize-reason`
- `#lead-update-form`
- `#lead-id`
- `#lead-status`
- `#lead-notes`
- `#lead-alert`
- `#logout-btn`

