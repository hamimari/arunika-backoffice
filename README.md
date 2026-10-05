# Arunika Backoffice

Admin panel for the Arunika platform. Built with React 19, TypeScript, Vite, and Ant Design.

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** — build tool and dev server
- **Ant Design 6** — UI component library
- **TanStack Query** — server state management
- **Zustand** — client state management
- **React Router 7** — client-side routing
- **Axios** — HTTP client

---

## Prerequisites

- Node.js >= 22 (an `.nvmrc` is provided — run `nvm use`)
- npm >= 10
- A running instance of the [Arunika backend API](../arunika%20backend)

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env.local` file in the project root:

```env
VITE_API_BASE_URL=http://localhost:8080
```

Replace the URL with the address of your local backend instance.

### 3. Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` by default.

### Other useful commands

| Command | Description |
|---------|-------------|
| `npm run build` | Type-check and compile for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ci` | Tests with coverage + JUnit output (what CI runs) |

---

## Testing

```bash
nvm use           # Node 22 — the suite will not start on older versions
make test-fast    # inner loop: npm test
make test-all     # everything CI runs on a pull request
```

> **Node 22 is required.** Vitest 4 / rolldown import `styleText` from
> `node:util`, which does not exist before Node 20.19. On an older Node the
> suite fails at module load with a `SyntaxError` before running a single
> test — it does not fail gracefully.

63 tests across 11 files cover the API modules and 7 of the 20 pages. CI runs
them on every pull request (`.github/workflows/pr.yml`).

### Coverage ratchet

`make test-all` compares per-directory coverage against
`coverage-baseline.json` and reports any directory that dropped. It is
**report-only** today — it prints regressions without failing the build. After
intentional changes:

```bash
make coverage-baseline
```

Current baseline is 38.3% overall; `src/api` 70.2%, `src/hooks` 54.5%,
`src/pages` 32.0%, `src/components` 25.9%, `src/store` 0%.

Full guide (suites, how to run each, CI): [`docs/automation-testing.md`](docs/automation-testing.md).

### Flaky tests

A flaky test is one whose result changes between runs on an unchanged commit.
The policy across all three Arunika repositories:

- **Never add a retry to hide one.** Retries are permitted only in the E2E
  tier, where a real browser has genuine nondeterminism. A non-deterministic
  component test is a real defect in the test or the code.
- **Quarantine within one working day.** Mark it `test.skip` with a link to a
  tracking issue so it stops blocking merges while still being visible.
- **Assign an owner and a two-week expiry.** At expiry it is fixed or
  deleted. A permanently quarantined test is worse than no test — it burns CI
  time and erodes trust in the suite.
- **Common causes here:** asserting before TanStack Query resolves (use
  `findBy*`, never `getBy*` after an async action), antd portal timing for
  modals and dropdowns, and `axios-mock-adapter` handlers leaking between
  tests (reset in `afterEach`).

---

## Production Deployment

Production (`https://admin.haloarunika.com`) deploys automatically. When a push to `master` passes `Merge (admin E2E)`, `.github/workflows/deploy.yml` connects to the VPS over SSH and runs `arunika-backend/deploy/deploy.sh backoffice <sha>`. The script rebuilds and restarts only the backoffice container, and the workflow then checks the site.

To redeploy or roll back, open Actions → Deploy, click "Run workflow" and set `ref` to any commit on `master`.

The VPS and GitHub setup, including the `production` environment secrets, is described in the backend README under "Automatic deploys".

### Option A: Docker (recommended)

The project ships with a multi-stage `Dockerfile` that builds the app and serves it via nginx.

**Build the image:**

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com \
  -t arunika-backoffice .
```

**Run the container:**

```bash
docker run -p 3000:80 arunika-backoffice
```

The panel will be available at `http://localhost:3000`.

> `VITE_API_BASE_URL` is baked into the static bundle at build time. Rebuild the image whenever the API URL changes.

---

### Option B: Docker Compose (full stack)

From the backend repository root, use the provided `docker-compose.yml` which includes all services (API, database, Redis, and this backoffice):

```bash
# Copy and fill in environment variables
cp .env.example .env

# Build and start all services
docker compose up --build
```

The backoffice will be served on the port defined by `BACKOFFICE_PORT` in your `.env` (default `3000`).

---

### Option C: Static hosting (Vercel, Netlify, S3, etc.)

```bash
# Set the API URL for this environment
VITE_API_BASE_URL=https://api.yourdomain.com npm run build
```

Upload the contents of the `dist/` directory to your static host. Configure the host to redirect all requests to `index.html` (SPA fallback).

Example redirect rule for nginx:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## Project Structure

```
src/
├── api/          # Axios API clients (admin, content, packages, analytics)
├── components/   # Shared UI components (AppLayout, ContentTable, ...)
├── hooks/        # Reusable hooks (useContentPage, ...)
├── pages/        # Page components grouped by feature
│   ├── auth/
│   ├── content/  # AR cards, categories, fairy tales, dongeng pages
│   └── packages/ # Premium packages
├── store/        # Zustand stores (auth, ...)
└── App.tsx       # Router definition
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Base URL of the Arunika backend API |
