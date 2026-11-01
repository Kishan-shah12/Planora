# Contributing

Thanks for helping. A few rules keep the project easy to trust.

## Setup

```bash
npm install
cp .env.example .env      # GEMINI_API_KEY is optional; tests never call the real API
npm run dev
```

## Before you open a pull request

```bash
npm run check             # typecheck, strict lint, unit and integration tests
npm run coverage          # fails below 99% lines overall or 100% lines in the engine
npm run e2e               # Playwright + axe (run `npx playwright install chromium` once)
npm run format:check
```

## Where code goes

- **Money and dates:** only in `src/engine`, as pure functions that take `today` as a parameter. Add tests for edge cases (zero, huge, rounding, past dates).
- **Components:** render and dispatch. If a component needs a number, add an engine function.
- **AI:** add a schema in `src/schemas/ai.ts`, a prompt in `api/_lib/prompts.ts`, and a thin handler with `createHandler`. Validate the model output; never trust it.
- **Docs:** update `README.md` and the relevant file in `docs/` when behaviour changes.

## Style

- TypeScript strict; no `any`, `@ts-ignore` or non-null assertions.
- Prettier formatting and typescript-eslint `strictTypeChecked` are enforced in CI.
- Keep files small and single-purpose (components under 250 lines).
- Commit messages follow `type(scope): summary`, for example `feat(timeline): compress close events`.

## Security

Never commit keys. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
