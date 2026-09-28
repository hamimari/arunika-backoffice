# Automation testing — arunika-backoffice

How the admin app is tested and how to run each suite again. Other repos:
[app](../../arunika_app/docs/automation-testing.md),
[backend](../../arunika-backend/docs/automation-testing.md). Rationale and
history: `arunika_app/openspec/changes/add-automation-testing-strategy/`.

**Node 22 is required** (`.nvmrc`). Vitest 4 / rolldown import `styleText` from
`node:util`, which older Node lacks; on Node 16 the suite cannot even start.

## Suites

| Suite | Where | Needs | CI |
|---|---|---|---|
| Unit / component (Vitest, jsdom, `axios-mock-adapter`) | `src/test/` | nothing | every PR (`pr.yml`) |
| **Admin E2E** (Playwright, headless Chromium) | `e2e/` | the backend E2E stack | on merge (`merge.yml`) |

## Everyday loop

```bash
make test-fast          # npm test  (168 tests, 19 files)
make test-all           # lint + typecheck + coverage + ratchet (what a PR runs)
npm run test:watch
```

After an intentional coverage change: `make coverage-baseline`.

Conventions: pages that share one implementation (`ArCardsPage`, `BadgesPage`,
`CategoriesPage`, `CountingPage`, `TracingPage`, `ArCardCategoriesPage` all wire
`useContentPage` to a `ContentTable`) are covered once, parameterised, in
`src/test/pages/ContentPages.test.tsx` — don't add six copies. The API client's
token refresh (`src/test/api/client.test.ts`) is the highest-value logic here:
a client that signs out on every 401 signs an admin out several times an hour.
`authApi.refresh` deliberately uses a bare `axios.post` so the refresh call
doesn't pass through the interceptor that triggers it; mock accordingly.

## Admin E2E — Playwright

Three publishing flows in `e2e/admin-publishing.spec.ts`: category → AR card →
visibility → published; dongeng → publish; package → add items → publish. Two
strike-price flows in `e2e/strike-prices.spec.ts`: a global "Harga Coret" rule is
saved and shown as active; a package override reaches `/premium/packs`. Final
state is verified through the app's public API, not just the UI.

**1. Start the stack** (from `arunika-backend`) and leave it running:

```bash
make e2e-hold          # prints "E2E STACK READY"; backoffice :3010, API :8090
```

**2. Run the specs** (first time only: `npx playwright install chromium`):

```bash
npm run e2e                                   # all
npx playwright test -g "dongeng"              # one flow
E2E_BASE_URL=http://localhost:3010 E2E_API_URL=http://localhost:8090 npm run e2e   # explicit
```

Specs share one database and one admin account, so they run serially
(`workers: 1`); `helpers.ts` generates unique names per run. On failure, traces,
video and screenshots are kept: `npx playwright show-report`.

`vite.config.ts` excludes `e2e/**` from Vitest, so `npm test` never tries to run
Playwright specs.

## CI

| File | Trigger | What |
|---|---|---|
| `pr.yml` | pull request | eslint, `vitest run --coverage`, ratchet |
| `merge.yml` | push, `backoffice-merged` dispatch, manual | checks out the backend, starts the stack, runs Playwright, uploads report + traces on failure |

`merge.yml` has **not run on GitHub yet** — run it once with *Run workflow*. It
checks out `arunika-backend` with `CROSS_REPO_TOKEN`, falling back to the
workflow token.

## Known gaps

- Page coverage is by behaviour, not one file per page; check `npm run test:ci` coverage output before assuming a page is untested.
- Visual regression is out of scope.
