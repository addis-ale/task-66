# Philatelic Museum Operations Suite

Full-stack operations platform for a philatelic museum: collection discovery, knowledge graph curation, exhibit route orchestration, program operations, staffing governance, analytics/reporting, secure exports, and auditability.

## 1) Docker-based Quickstart (Primary Path)

### Prerequisites

- Docker and Docker Compose
- No external database required (MongoDB included as container)

### Start the complete stack

```bash
docker-compose up -d
```

This will start:
- MongoDB on port 27017
- Backend API on port 8888
- Frontend on port 5173

### Verify services are ready

```bash
docker-compose ps
```

Expected output shows all services as `healthy` or `running`.

### Seed development users

```bash
docker-compose exec backend ENABLE_DEV_SEED=true npm run seed:dev
```

### Access the application

- Frontend URL: `http://localhost:5173`
- Backend API base: `http://localhost:8888/api/v1`
- Health check: `http://localhost:8888/api/v1/health`

### OpenAPI / Swagger UI

- In Docker (`NODE_ENV=production`), docs are shown only when `ENABLE_SWAGGER=true` (default in `docker-compose.yml`). Set `ENABLE_SWAGGER=false` to hide docs.
- Swagger UI is available at `http://localhost:8888/api/v1/docs`.
- Raw OpenAPI file is served at `http://localhost:8888/api/v1/docs/openapi.yaml`.
- Postman and Swagger use the same base URL: `http://localhost:8888/api/v1`.
- `FRONTEND_ORIGIN` must include `http://localhost:8888` when using Swagger on the API host; `docker-compose.yml` includes both `http://localhost:5173,http://localhost:8888`.
- Auth notes for both tools:
  - Login first via `POST /auth/login` to obtain cookie `museum_sid`.
  - Send `X-CSRF-Token` on mutating requests (login is exempt).
  - Send `X-Step-Up-Token` for sensitive actions after `POST /auth/step-up`.
- Safety note: enabling Swagger in production exposes API documentation; keep `ENABLE_SWAGGER=false` in real production deployments.

## 2) Runtime Readiness Behavior

- Health endpoint is always reachable at `GET /api/v1/health`.
- Health includes DB state (`data.db.ready`, `data.db.connected`, `data.db.lastError`).
- If DB is not ready, DB-backed endpoints fail fast with:
  - HTTP `503`
  - code `SERVICE_UNAVAILABLE`
  - clear retry message/details
- Report scheduler does not crash process when DB is unavailable.
- CSRF behavior: `POST /api/v1/auth/login` is bootstrap-exempt; unsafe routes after login still require `X-CSRF-Token`.
- Program scheduling behavior: `POST /api/v1/program-sessions` now enforces coach availability windows and returns `422 COACH_UNAVAILABLE` when outside declared windows.
- Lockout behavior: failed login attempts for existing users count toward lockout even when submitted password format is weak.
- Structured runtime logs include `requestId`, `route`, `actorId`, `action`, `outcome`, and `errorCode` (without request body/password logging).
- Export detail access is object-scoped: requester or Administrator only.
- Catalog pagination contract: `pageSize` accepts up to **50**; `51+` returns validation error.

## 3) Deterministic Verification Commands

### Fast Docker smoke check

```bash
curl -s http://localhost:8888/api/v1/health | jq -r '.data.status'
```

Expected output:

- `ok`

### Full tests

```bash
docker-compose exec backend ./run_tests.sh
```

Expected summary:

- `unit_tests : PASS`
- `API_tests  : PASS`
- `Overall    : PASS`

Coverage highlights in the existing suite now include:

- coach availability window enforcement (`in-window` success, `out-of-window` rejection)
- lockout accounting when repeated weak-format login attempts target an existing user
- route segment payload guards (invalid dwell/distance) and invalid optional branch selection rejection
- session idle-expiry boundary unit check without wall-clock waiting
- step-up token expiry timeout enforcement
- audit mutation attempts blocked and invalid audit date filters rejected
- catalog `pageSize` boundary contract (`50` allowed, `51` rejected)

### Frontend verification (Docker context)

Run these commands using Docker Compose exec:

1) Install frontend dependencies

```bash
docker-compose exec frontend npm install
```

Expected output includes:

- `added ... packages` (first run) or `up to date` (subsequent runs)
- `found 0 vulnerabilities` (or npm audit summary)

2) Build frontend production bundle

```bash
docker-compose exec frontend npm run build
```

Expected output includes:

- `vite build`
- `built in ...`

3) Run unit/component/integration suites separately

```bash
docker-compose exec frontend npm run test:unit
docker-compose exec frontend npm run test:component
docker-compose exec frontend npm run test:integration
```

Expected output includes:

- `ok` summary for node unit tests
- `Test Files ... passed` for vitest component/integration runs

4) Run all frontend tests in one command

```bash
docker-compose exec frontend npm run test:frontend
```

Expected output includes all three suites passing in sequence.

5) Install Playwright browser prerequisite (required once per container)

```bash
docker-compose exec frontend npm run test:e2e:setup
```

This runs `playwright install chromium` and output includes browser download/install completion.

6) Run E2E suite

```bash
docker-compose exec frontend npm run test:e2e
```

Expected output includes Playwright passing summary for all specs.

Frontend verification coverage includes:

- blank login form defaults unless explicitly enabled for non-production development
- offline queue sanitization (no token/header persistence)
- user-scoped API cache behavior and logout/user-switch purge hooks
- role/tab access checks (allowed + forbidden)
- search loading/empty/error/sort/pagination behavior
- restricted panel render guard denial behavior
- route-builder validation and itinerary generation flow states
- program/staffing failure and retry behavior

Playwright scenarios now verify:

- user A -> logout -> user B cross-user isolation
- restricted panel denial on unauthorized hash access attempts
- happy paths for search, graph publish, route itinerary generation, program scheduling, and staffing approval

## 4) Prompt Capability Mapping (Theme Fidelity)

The implementation maps directly to the business prompt scope:

- **Collection discovery/search**: catalog search, fuzzy matching, autocomplete, hot keywords, curation CRUD, and UI controls for category/tags/period/series filters with `pageSize <= 50`.
- **Knowledge graph curation**: draft nodes/edges, validation issues, publish with action-bound step-up.
- **Exhibit hierarchy + routes**: venue -> hall -> zone -> display case hierarchy plus visual Route Builder canvas with typed route edges (`REQUIRED_NEXT`, `OPTIONAL_BRANCH`, `ACCESSIBILITY_DETOUR`), and guided read-only navigation/itinerary consumption for ROUTE_READ roles.
- **Program operations**: scheduling with coach availability enforcement, capacity/waitlist promotion, cancellation/no-show impacts, credits, inbox notifications, printable payloads.
- **Staffing governance**: job draft/submit/approve/reject/takedown/appeal/decision workflow with ownership checks.
- **Auth and controls**: password policy, lockout accounting on repeated failures (including weak-format attempts for existing users), session security, RBAC, one-time action-bound step-up, immutable audit events.
- **Analytics/reporting**: metrics, dashboards, anomaly rules with dedupe, report runs, reconciliation artifacts with checksum sidecars.
- **Exports and masking**: permissioned exports with sensitive-field masking policies and object-level read guard on export job details.
- **Offline-ready UX**: app-shell service-worker caching + write queueing on true network failures + sync controls (API reads are network-only to avoid private cache leakage).

## 5) Scope & Non-goals

- This project is a working implementation of the museum operations prompt, not a mock-only shell.
- Some UI surfaces prioritize operational clarity over advanced visual polish.
- Current visual Route Builder uses an SVG graph editor (click-to-link + typed segment editor) rather than a third-party diagram framework; this still satisfies the required visual orchestration behavior.
- No external SaaS dependencies are required for local verification beyond MongoDB.

## 6) Frontend Visual Route Builder Verification

1) Sign in as `admin.dev` (or a role with route permissions) in the Operations Console.
2) Open **Route Builder** and create venue/hall/zone/route.
3) Add display cases and confirm they appear as nodes on the canvas and in the hierarchy tree.
4) Link nodes and assign segment type/dwell/distance; confirm typed directional edges and order labels render on canvas.
5) Commit segments and generate itinerary; confirm itinerary ordering reflects the visual route.

## 6.1) Guided Navigation Verification (ROUTE_READ)

1) Sign in as a non-manager read role (for example `reviewer.dev`).
2) Open **Guided Navigation** tab and enter a known route id.
3) Confirm route metadata and segment list load via read-only endpoints.
4) Confirm printable itinerary payloads are visible when itineraries exist.

## 7) Seeded Development Users

- `admin.dev` / `AdminSecure!2026`
- `curator.dev` / `CuratorSecure!2026`
- `reviewer.dev` / `ReviewerSecure!2026`
- `coordinator.dev` / `CoordinatorSecure!2026`
- `employer.dev` / `EmployerSecure!2026`
- `auditor.dev` / `AuditorSecure!2026`

## 8) Clean delivery packaging note

For source-of-truth delivery snapshots, exclude generated/vendor artifacts:

- `**/node_modules/`
- `frontend/dist/`

These are intentionally ignored in `.gitignore` and should not be included in submission bundles.

Verify clean packaging before delivery:

```bash
bash scripts/verify-clean-delivery.sh
```

## 9) Acceptance Evidence

| Command | Expected result | Criterion proved |
| --- | --- | --- |
| `docker-compose up -d` then `docker-compose ps` | all services show `healthy` or `running` | 1.1.1 Docker stack starts and services are inspectable |
| `curl -s http://localhost:8888/api/v1/health` | health returns `data.status` + `data.db.ready` | 1.1.1 runtime starts and health is inspectable |
| `docker-compose exec backend ./run_tests.sh` | summary shows `Overall : PASS` | 1.1.2 reproducible test-backed verification |
| Open Route Builder UI and follow section 6 | visual node/edge orchestration for typed segments | 1.3.1 prompt theme fidelity (visual route orchestration) |
| Review section 4 capability mapping | end-to-end feature map aligns with museum prompt | 1.3.2 no severe scope/theme deviation |

## 10) Acceptance Remediation

- Fixed pagination contract mismatch to prompt requirement (`pageSize <= 50`) across backend validation, API tests, and UI hint text.
- Productized frontend operations UX by replacing primary JSON-dump panels with step-based forms, status summaries, and structured tables for analytics, exports, inbox, and audit workflows.
- Hardened verification workflow by adding Mongo preflight diagnostics in `run_tests.sh` so environment failures are explicit and actionable.
- Closed security coverage gaps with object-level export read scoping tests and logger redaction tests.
- Added focused prompt-nuance coverage (12-hour late-cancel boundary, audit date filter validation, step-up expiry timeout, itinerary formula assertion).
