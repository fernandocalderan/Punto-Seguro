# Runtime Smoke Flakiness Report

Generated: 2026-03-05T10:12:20Z
Runs: 5
Base URL: http://localhost:3000

| Run | Exit | OTP status | Tracking missing | Network failures* | Console errors |
|---|---:|---|---|---:|---:|
| 1 | 0 | SKIPPED_ENV_NOT_CONFIGURED | lead_submit_success | 0 | 6 |
| 2 | 0 | SKIPPED_ENV_NOT_CONFIGURED | lead_submit_success | 0 | 6 |
| 3 | 0 | SKIPPED_ENV_NOT_CONFIGURED | lead_submit_success | 0 | 6 |
| 4 | 0 | SKIPPED_ENV_NOT_CONFIGURED | lead_submit_success | 0 | 6 |
| 5 | 0 | SKIPPED_ENV_NOT_CONFIGURED | lead_submit_success | 0 | 6 |

\* Network failures exclude expected `GET /api/eval-snapshot/me -> 404` and OTP 503 `otp_not_configured`.

Pass ratio: 5/5
