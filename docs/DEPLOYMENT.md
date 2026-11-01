# Deployment

The app is built for Vercel: the Vite build is served as static files and every file in `api/` becomes a serverless function. `vercel.json` sets the security headers and a 60 s function limit.

## Steps

1. Import the GitHub repository in Vercel. Framework preset: **Vite** (build `npm run build`, output `dist`).
2. Add environment variables for Production, Preview and Development:

| Variable                               | Required             | Value                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                       | Yes, for AI features | Your Google AI Studio key. Never prefix it with `VITE_`.                                                                                                                                                                            |
| `GEMINI_MODEL`                         | No                   | Preferred model, or a comma-separated list. Default chain (newest first): `gemini-4-argon`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | No                   | Set automatically by **Storage → Upstash for Redis**. Shares the rate limit and AI cache across instances.                                                                                                                          |

3. Deploy. Every push to `main` redeploys.

## Checking a deployment

```bash
# Security headers (expect a strict CSP with style-src 'self', HSTS, X-Frame-Options DENY)
curl -sI https://<your-app>.vercel.app/

# Cross-site and origin-less calls are refused
curl -s -X POST https://<your-app>.vercel.app/api/parse-intake -H "Content-Type: application/json" -d '{}'
# -> {"error":"FORBIDDEN_ORIGIN"}

# A same-origin call works
curl -s -X POST https://<your-app>.vercel.app/api/parse-intake \
  -H "Content-Type: application/json" -H "Origin: https://<your-app>.vercel.app" \
  -d '{"text":"Shaadi in Pune, 200 guests, 8 lakh, mid-Feb"}'
```

## Local development

```bash
npm install
cp .env.example .env   # add GEMINI_API_KEY
npm run dev            # Vite serves the UI and the same /api handlers
```

`vite preview` (used by the end-to-end tests) applies the exact headers from `vercel.json`, so the strict CSP is tested before every deploy.
