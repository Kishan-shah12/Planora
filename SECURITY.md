# Security

## Reporting a problem

Please open a private security advisory on this repository (Security → Advisories → Report a vulnerability) instead of a public issue. Include the steps to reproduce and the impact you expect.

## How the app protects users and the AI budget

| Layer            | Measure                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets          | `GEMINI_API_KEY` exists only in the server environment. It is never sent to the browser, logged, or committed (`.env` is gitignored).                                                                                                                                                                       |
| API access       | POST only, `application/json` only, same-origin only (cross-site or origin-less calls get `403`), per-IP rate limit, 8 KB body cap.                                                                                                                                                                         |
| Input            | Every request body is validated with zod, with explicit length caps on free text.                                                                                                                                                                                                                           |
| AI output        | Gemini runs in JSON mode with a schema, and the result is validated again with zod before it leaves the server and once more in the client. Invalid output becomes `502 AI_RESPONSE_INVALID`.                                                                                                               |
| Prompt injection | User text is wrapped as data, closing-tag tricks are stripped, and system prompts forbid inventing prices, vendors or availability. Money and dates are never computed by the model.                                                                                                                        |
| Errors           | Responses carry a short error code only. No stack traces, prompts or user text are logged.                                                                                                                                                                                                                  |
| Browser          | Strict CSP with no `unsafe-inline` (`default-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `X-Frame-Options: DENY`, COOP, `nosniff`, referrer and permissions policies. The e2e suite runs the built app under these exact headers and fails on any console error. |
| Shared links     | Size-capped, base64url-checked, schema-validated and consistency-checked (budgets must sum, tasks must not loop) before use.                                                                                                                                                                                |
| Dependencies     | Lockfile committed, `npm ci` in CI, `npm audit --audit-level=high` enforced in CI.                                                                                                                                                                                                                          |

## Known limits

With `KV_REST_API_URL` and `KV_REST_API_TOKEN` set (Vercel's Upstash Redis integration), the rate limit and response cache are shared by every serverless instance; store keys are SHA-256 hashes, so no user text is stored as a key. Without them, both fall back to per-instance memory, and an unreachable store fails open to memory after 1.5 s rather than breaking the app. A determined server-side caller can forge an `Origin` header; the rate limit and validation still apply to them.
