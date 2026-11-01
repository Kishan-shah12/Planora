# Testing

## Running

```bash
npm run check          # typecheck + strict lint + all unit and integration tests
npm run coverage       # the same tests with coverage thresholds (fails below them)
npm run e2e            # Playwright in real Chromium: desktop and Pixel 7 (run `npx playwright install chromium` once)
npm run format:check   # Prettier
```

CI (`.github/workflows/ci.yml`) runs format, check, coverage, build and `npm audit` in one job, then the Playwright suite in a second job, on every push.

## Results

| Suite                                                                                                    | Folder          | Tests   | Result         |
| -------------------------------------------------------------------------------------------------------- | --------------- | ------- | -------------- |
| Engine: money, budget, timeline, compression, trade-offs, quotes, checklist, insights, advisor, calendar | `tests/engine`  | 141     | Passed         |
| Schemas and share-link payloads                                                                          | `tests/schemas` | 9       | Passed         |
| API: handlers, guards, rate limit, cache, shared store, Gemini client and failover                       | `tests/api`     | 77      | Passed         |
| UI: flows, assistant and chat, timeline, vendors, theme and contrast, state, client, axe                 | `tests/ui`      | 145     | Passed         |
| Project hygiene                                                                                          | `tests/quality` | 8       | Passed         |
| **Unit and integration total**                                                                           |                 | **380** | **All passed** |
| End to end in real Chromium (7 scenarios × desktop and mobile)                                           | `e2e/`          | 14      | All passed     |

| Coverage (src + api) | Result | Threshold enforced in CI |
| -------------------- | ------ | ------------------------ |
| Lines                | 100%   | 100%                     |
| Statements           | 100%   | 100%                     |
| Functions            | 100%   | 100%                     |
| Branches             | 99.6%  | 99%                      |

The few uncovered branches are defensive fallbacks that cannot run (for example an array lookup TypeScript cannot prove is defined).

## What each area proves

| Area                    | What is checked                                                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money                   | `parseINR` for "8 lakh", "8L", "8,00,000", "₹800000", "8.5 lac", "2 crore" and invalid input; en-IN formatting; largest-remainder sums exactly for many totals                                                                                                                      |
| Budget                  | Allocation sums for every occasion and total (0 to 50 billion); priorities; redistribution with locks, caps, all locked, NaN and negatives; 1 and 5,000 guests                                                                                                                      |
| Timeline                | Dependency order, cycles and unknown dependencies (typed errors), delay propagation, done tasks, past events, today's event                                                                                                                                                         |
| Compression             | **Property test**: for every occasion and every event 0 to 200 days away, an on-time plan fits between today and the event, keeps its order, and is never overdue, at risk or impossible                                                                                            |
| Trade-offs              | Each option closes the gap exactly and keeps the total; guest option limited to under 25%; buffer warning; locked and priority categories untouched                                                                                                                                 |
| Quotes                  | Effective cost, every flag, missing fields, inquiry draft, 3-per-category cap, accept and remove                                                                                                                                                                                    |
| Assistant               | Ranking of every insight type; built-in answers by topic in English and Hinglish; facts sent to the AI                                                                                                                                                                              |
| API                     | 403 cross-site, 405, 415, 400, 413, 429, 502 invalid output, 503, 504 timeout; prompt-injection text treated as data; cache hits; shared store counter, cache, failures and key hashing; model failover and cooldowns                                                               |
| UI                      | Create a plan, grow guests, see and apply options; diff toast; locks; error summary focus and links; AI fill, explain, ideas, review and chat with failure and retry; delay highlighting; calendar download; vendor analysis, copy and accept; share link; dark mode; keyboard tabs |
| Accessibility           | axe on every tab and state (jsdom), axe with colour contrast in real Chromium in light and dark, token contrast for every text pair                                                                                                                                                 |
| Security in the browser | The built app runs under the exact production CSP with zero console errors                                                                                                                                                                                                          |
| Hygiene                 | Required docs exist; files under 250 lines; no `any` or `ts-ignore`; no HTML injection or `eval`; no browser logging; server logs carry no request data; no credentials; key never referenced in client code                                                                        |

## Approach

- The engine is pure, so tests call it directly with a fixed `today` and need no mocks.
- API handlers are called with small request and response doubles; Gemini and the shared store are replaced with fakes that succeed, fail or return garbage on demand. No test touches the network.
- UI tests drive the real app with Testing Library and `user-event`, with `fetch` stubbed per test.
- Playwright runs the production build under the production headers with `/api` mocked, so it needs no key.

## Not automated

Screen-reader output, the native print dialog and Windows high-contrast rendering are checked by hand (see [ACCESSIBILITY.md](ACCESSIBILITY.md)).
