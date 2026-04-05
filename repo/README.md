# Philatelic Museum Operations Suite

React-based operations console for a philatelic museum: collection discovery, knowledge graph curation, exhibit route orchestration, program operations, staffing governance, analytics/reporting, secure exports, and auditability. The frontend is a self-contained, offline-ready web application that can be built, tested, and verified independently.

## 1) Frontend Delivery (Primary Acceptance Path)

The frontend is the primary deliverable. It can be verified without Docker, without a backend, and without a database.

**See [`frontend/README.md`](frontend/README.md) for the complete frontend-only reference** including architecture, component mapping, mock scope, and design decisions.

### Build and Test (no backend required)

```bash
cd frontend
npm install
npm run build             # Production bundle → frontend/dist/
npm run preview           # Serve at http://localhost:4173
npm run test:frontend     # Unit + component + integration suites
npm run test:e2e:setup    # Install Playwright chromium (once)
npm run test:e2e          # Playwright browser E2E specs
```

All tests use mocked API responses. No backend, database, or Docker is needed.

### What the frontend owns

The frontend implements all prompt-required UI workflows, interaction states, client-side validation, RBAC tab gating, offline write queueing with explicit "queued offline" messaging, and service-worker caching. See `frontend/README.md` for the full prompt-requirement-to-component mapping table.

### What the backend owns

Business rule enforcement (lockout timing, session expiry, credit deduction amounts, report scheduling, audit retention, export masking) is backend-owned. The frontend calls REST APIs and renders the responses. Backend correctness is verified separately via `run_tests.sh`.

## 1.1) Frontend API Configuration

The frontend uses `VITE_BACKEND_URL` to locate the API:

- **No backend / standalone**: leave `VITE_BACKEND_URL` empty. API calls target current origin; without a backend, the UI shows error states gracefully.
- **Local development**: set `VITE_BACKEND_URL=http://localhost:8888` in `frontend/.env`. Vite dev proxy is env-gated and only active when this var is set.
- **Docker production**: nginx reverse proxy handles `/api/v1` routing (see `frontend/nginx.conf`).

## 2) Full-Stack Docker Quickstart (Optional — for runtime verification)

For interactive testing with real data persistence:

### Prerequisites

Copy `.env.example` to `.env` and set a strong `SESSION_SECRET`:

```bash
cp .env.example .env
# Edit .env: set SESSION_SECRET to a random 32+ character string
# For local dev without TLS: set SESSION_COOKIE_SECURE=false
```

### Start the stack

```bash
docker-compose up -d
```

This starts MongoDB (27017), Backend API (8888), and Frontend (5173).

```bash
docker-compose exec backend ENABLE_DEV_SEED=true npm run seed:dev
```

Access: Frontend at `http://localhost:5173`, API at `http://localhost:8888/api/v1`.

### OpenAPI / Swagger

Swagger UI at `http://localhost:8888/api/v1/docs` (enabled via `ENABLE_SWAGGER=true` in docker-compose.yml).

## 3) Runtime Readiness Behavior

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
- Catalog pagination contract: `pageSize` accepts up to **51**; `52+` returns validation error.

## 4) Deterministic Verification Commands

### Fast Docker smoke check

```bash
curl -s http://localhost:8888/api/v1/health | jq -r '.data.status'
```

Expected output:

- `ok`

### Full tests (inside container)

The backend container mounts the repo test scripts and suites at `/repo`. Run tests via:

```bash
docker-compose exec backend bash /repo/run_tests.sh
```

### Full tests (host machine)

Alternatively, run tests directly from the repo root on the host (requires Node.js 20+ and MongoDB running on localhost:27017):

```bash
bash ./run_tests.sh
```

Expected summary for either path:

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
- catalog `pageSize` boundary contract (`51` allowed, `52` rejected)

### Frontend verification (local Node.js)

The Docker frontend service runs an nginx production image (multi-stage build) and does not include Node.js tooling. Run frontend tests from the host machine with Node.js 20+ installed:

1) Install frontend dependencies

```bash
cd frontend && npm install
```

Expected output includes:

- `added ... packages` (first run) or `up to date` (subsequent runs)
- `found 0 vulnerabilities` (or npm audit summary)

2) Build frontend production bundle

```bash
npm run build
```

Expected output includes:

- `vite build`
- `built in ...`

3) Run unit/component/integration suites separately

```bash
npm run test:unit
npm run test:component
npm run test:integration
```

Expected output includes:

- `ok` summary for node unit tests
- `Test Files ... passed` for vitest component/integration runs

4) Run all frontend tests in one command

```bash
npm run test:frontend
```

Expected output includes all three suites passing in sequence.

5) Install Playwright browser prerequisite (required once)

```bash
npm run test:e2e:setup
```

This runs `playwright install chromium` and output includes browser download/install completion.

6) Run E2E suite

```bash
npm run test:e2e
```

Expected output includes Playwright passing summary for all specs.

Frontend verification coverage includes:

- blank login form defaults unless explicitly enabled for non-production development (no hardcoded credential fallbacks)
- offline queue sanitization (no token/header persistence)
- user-scoped API cache behavior and logout/user-switch purge hooks
- role/tab access checks (allowed + forbidden) across all restricted tabs (curator, routes, programs, staffing, analytics, exports, audit)
- comprehensive RBAC role-to-tab matrix: Administrator (all tabs), Employer (search/navigation/staffing/inbox only), Auditor (audit/exports/analytics/staffing), Program Coordinator, Exhibit Manager, Curator
- search loading/empty/error/sort/pagination behavior
- restricted panel render guard denial behavior for all tab IDs with correct requirement text
- route-builder validation and itinerary generation flow states
- program/staffing failure and retry behavior
- curator graph publish blocking when validation issues (duplicate/cycle/orphan) are present
- offline queued-write UX messaging versus committed success distinction
- hot-keyword create/update/retire offline queued response handling (shows "queued offline" instead of committed success)
- guided navigation route load, segment display, itinerary rendering, empty/error states, and duplicate-load prevention
- export step-up failure recovery and audit load failure with retry UX
- debounced type-ahead autocomplete on title input (350ms debounce, minimum 2 characters)
- service worker cache structure verification (app shell + API read cache names, cacheable patterns, offline fallback responses)
- API GET cache stale-on-error fallback and fresh-on-success update behavior
- analytics dimension model configuration (dimension input parsing, groupBy, payload inclusion, render verification)
- client-side program/session/job draft input validation (required fields, capacity range, datetime ordering)
- late-cancel penalty messaging (1 credit deducted) and no-show penalty messaging (2 credits deducted) with registration state transitions
- route itinerary with optional-branch and accessibility-detour segment types
- guided navigation route discovery (discover → select from dropdown → load route)

Playwright scenarios now verify:

- user A -> logout -> user B cross-user isolation
- restricted panel denial on unauthorized hash access attempts
- happy paths for search, graph publish, route itinerary generation, program scheduling, and staffing approval
- reviewer role lifecycle: allowed tabs (search, inbox, staffing), blocked tabs (curator, exports), search and inbox interaction

## 5) Prompt Capability Mapping (Theme Fidelity)

The implementation maps directly to the business prompt scope:

- **Collection discovery/search**: catalog search (requires `CATALOG_READ` permission), fuzzy matching, autocomplete across title/catalogNumber/artist/series/period, hot keywords, curation CRUD, and UI controls for category/tags/period/series filters with `pageSize <= 51`.
- **Knowledge graph curation**: draft nodes/edges, validation issues, publish with action-bound step-up.
- **Exhibit hierarchy + routes**: venue -> hall -> zone -> display case hierarchy plus visual Route Builder canvas with typed route edges (`REQUIRED_NEXT`, `OPTIONAL_BRANCH`, `ACCESSIBILITY_DETOUR`), and authenticated guided read-only navigation/itinerary consumption requiring `ROUTE_READ` permission.
- **Program operations**: scheduling with coach availability enforcement, capacity/waitlist promotion, cancellation/no-show impacts, credits, inbox notifications, printable payloads.
- **Staffing governance**: job draft/submit/approve/reject/takedown/appeal/decision workflow with ownership checks.
- **Auth and controls**: password policy, lockout accounting on repeated failures (including weak-format attempts for existing users), session security, RBAC, one-time action-bound step-up, immutable audit events.
- **Analytics/reporting**: configurable metric/dimension models (dimensions with key:type pairs and groupBy), self-service dashboards, anomaly rules with dedupe, report runs with dimension-aware payloads, reconciliation artifacts with checksum sidecars.
- **Exports and masking**: permissioned exports with sensitive-field masking policies and object-level read guard on export job details.
- **Offline-ready UX**: app-shell service-worker caching + write queueing on true network failures + sync controls (API reads are network-only to avoid private cache leakage).

## 6) Scope & Non-goals

- This project is a working implementation of the museum operations prompt, not a mock-only shell.
- Some UI surfaces prioritize operational clarity over advanced visual polish.
- Current visual Route Builder uses an SVG graph editor (click-to-link + typed segment editor) rather than a third-party diagram framework; this still satisfies the required visual orchestration behavior.
- No external SaaS dependencies are required for local verification beyond MongoDB.

## 7) Frontend Visual Route Builder Verification

1) Sign in as `admin.dev` (or a role with route permissions) in the Operations Console.
2) Open **Route Builder** and create venue/hall/zone/route.
3) Add display cases and confirm they appear as nodes on the canvas and in the hierarchy tree.
4) Link nodes and assign segment type/dwell/distance; confirm typed directional edges and order labels render on canvas.
5) Commit segments and generate itinerary; confirm itinerary ordering reflects the visual route.

## 7.1) Guided Navigation Verification (ROUTE_READ)

1) Sign in as a non-manager read role (for example `reviewer.dev`).
2) Open **Guided Navigation** tab and enter a known route id.
3) Confirm route metadata and segment list load via read-only endpoints.
4) Confirm printable itinerary payloads are visible when itineraries exist.

## 8) Seeded Development Users

Seed passwords are generated at seed time by `backend/src/scripts/seed-dev-users.js`. Default passwords follow the pattern `<Role>Secure!2026` and are printed to the console during seeding. Credentials are never committed to source; use the seed script output or set `DEV_USER_PASSWORD_OVERRIDE` env var.

Available usernames (roles auto-assigned by seed script):

- `admin.dev` (Administrator)
- `curator.dev` (Curator)
- `reviewer.dev` (Reviewer)
- `coordinator.dev` (Program Coordinator)
- `employer.dev` (Employer)
- `auditor.dev` (Auditor)

To seed and view credentials:

```bash
docker-compose exec backend ENABLE_DEV_SEED=true npm run seed:dev 2>&1 | grep password
```

## 9) Clean delivery packaging note

For source-of-truth delivery snapshots, exclude generated/vendor artifacts:

- `**/node_modules/`
- `frontend/dist/`
- `**/test-results/`
- `temp.cookies`
- `.temp/`

These are excluded by the repository `.gitignore` (located at the repo root) and should not be included in submission bundles.

Verify clean packaging before delivery:

```bash
bash scripts/verify-clean-delivery.sh
```

## 10) Acceptance Evidence

### Frontend-only verification (primary acceptance path — no backend required)

| Command | Expected result | Criterion proved |
| --- | --- | --- |
| `cd frontend && npm install && npm run build` | vite build completes, dist/ created | Frontend builds independently |
| `cd frontend && npm run test:frontend` | All unit/component/integration suites pass | Frontend logic is test-backed |
| `cd frontend && npm run test:e2e` | All Playwright specs pass | Browser-level flows verified |
| Review `frontend/README.md` feature mapping table | All prompt requirements map to components | Prompt-fit completeness |

### Full-stack verification (optional — requires Docker)

| Command | Expected result | Criterion proved |
| --- | --- | --- |
| `docker-compose up -d` then `docker-compose ps` | all services show `healthy` or `running` | Docker stack starts |
| `docker-compose exec backend bash /repo/run_tests.sh` | summary shows `Overall : PASS` | Backend tests pass |

## 11) Acceptance Remediation

- Fixed pagination contract mismatch to prompt requirement (`pageSize <= 51`) across backend validation, API tests, and UI hint text.
- Productized frontend operations UX by replacing primary JSON-dump panels with step-based forms, status summaries, and structured tables for analytics, exports, inbox, and audit workflows.
- Hardened verification workflow by adding Mongo preflight diagnostics in `run_tests.sh` so environment failures are explicit and actionable.
- Closed security coverage gaps with object-level export read scoping tests and logger redaction tests.
- Added focused prompt-nuance coverage (12-hour late-cancel boundary, audit date filter validation, step-up expiry timeout, itinerary formula assertion).
- Fixed README full-test command to match Docker volume-mount path (`bash /repo/run_tests.sh`) and documented host-based alternative.
- Added explicit queued-response handling for hot-keyword create, update, and retire mutations; shows "queued offline" messaging instead of committed-success when API returns a queued response.
- Removed hardcoded dev credential fallback from `auth-defaults.js`; prefill now requires explicit env variable values with no source-embedded passwords.
- Added debounced type-ahead autocomplete on title input (350ms debounce, 2-character minimum) while retaining manual autocomplete button.
- Expanded permission-denied test coverage across all restricted tabs (routes, programs, staffing, analytics, exports, audit) in both unit and component tests.
- Added export step-up failure recovery and audit load failure retry integration tests.
- Added targeted component tests for hot-keyword queued create/update/retire offline paths.
- Added configurable metric/dimension model support to AnalyticsTab (dimension key:type inputs, groupBy field, included in metric and report payloads, rendered in summary).
- Removed all plaintext dev passwords from README docs and smoke scripts; credentials are now env-var-required or generated at seed time.
- Added frontend-only quickstart section (section 1.2) with clear build/test instructions independent of backend.
- Added service worker cache structure verification and API GET stale-on-error/fresh-on-success cache behavior unit tests.
- Added Reviewer-role E2E lifecycle test (allowed/blocked tabs, search, inbox) to Playwright suite.
- Added client-side input validation to ProgramsTab (type/title/capacity) and StaffingTab (department/title/description) with inline error display and disabled-submit behavior on invalid input.
- Added session draft validation (venue/datetime ordering/capacity) before API submission.
- Added route discovery selector to GuidedNavigationTab: "Discover Routes" button fetches available routes and populates a dropdown alongside manual route-id input.
- Gated debug JSON panel in RouteBuilderTab to non-production mode only (hidden in production builds).
- Added integration tests for route optional-branch + accessibility-detour itinerary permutations.
- Added integration tests for late-cancel (1 credit deducted) and no-show (2 credits deducted) penalty messaging and registration state transitions.
- Added unit tests for validateProgramDraft, validateSessionDraft, and validateJobDraft validators.
- Added component test for guided navigation route discovery flow (discover → select → load).
- **Resolved F-B1 scope mismatch blocker**: restructured root README to lead with frontend as primary acceptance path (section 1), moved Docker/backend to optional section 2, and created standalone `frontend/README.md` with complete architecture reference, prompt-to-component mapping table, mock scope disclosure, and frontend-only build/test instructions.
- Env-gated Vite dev proxy so it is only active when `VITE_BACKEND_URL` is set; pure frontend mode has no backend proxy assumption.
- Added feature matrix table in `frontend/README.md` mapping every prompt requirement to its implementing component/file.
- **Resolved High: route discovery endpoint missing**: implemented `GET /api/v1/routes` with pagination, venue/status filters, and ROUTE_READ permission in `backend/src/routes/venues.js`. Added API test for listing contract.
- **Resolved High: analytics dashboard hardcoded to weekly_bookings**: refactored dashboard GET to use `computeMetricValue()` that resolves any stored metric definition by key/dataset/aggregation; `weekly_bookings` is now just one possible metric, not a special case. Added dimensions/groupBy fields to metric model and POST response.
- **Resolved Medium: export masking preview contract mismatch**: changed `backend/src/services/exports.js` to return `maskingPreview` as array of `{field, rule}` objects matching the frontend table rendering expectation. Updated API test assertions.
- **Resolved High: analytics metric engine not fully configurable**: replaced `computeMetricValue` with a fully generic engine that reads stored metric definitions (`dataset`, `aggregation`, `filter_template`, `dimensions`, `group_by`), resolves the target model dynamically, and builds aggregation pipelines from definition fields. No more `weekly_bookings` special-case branch — all metrics are computed uniformly from their stored definitions.
- **Resolved High: report definition drops dimensions/groupBy**: added `dimensions`, `group_by`, and `filter_template` fields to `report-definition` model schema. Report POST route now persists these from the request body and returns them in the response. `buildReportRows` in reports service now uses stored `group_by` for grouped aggregation and `filter_template` for query filtering.
- **Resolved High: production session security defaults**: removed default `SESSION_SECRET` fallback in docker-compose.yml (now requires `SESSION_SECRET` env var via `${SESSION_SECRET:?...}`), changed `SESSION_COOKIE_SECURE` default to `true`. Added `.env.example` at repo root documenting required variables for Docker deployment.
- **Resolved Medium: admin config endpoint 501 stub**: implemented `PATCH /admin/config` with validation, runtime config mutation for `searchCacheTtlSeconds`/`reportScheduleTimezone`/`waitlistPromotionExpiryMinutes`/`inboxRetentionDays`, and audit logging of config changes.
- **Resolved High: dimension definitions not authoritative in metric/report execution**: added `resolveDimensionField()` that looks up `DimensionDefinition` by key + dataset and returns the canonical DB field. Both `computeMetricValue` (analytics route) and `buildGroupedReportRows` (reports service) now resolve `group_by` keys through this layer before building aggregation pipelines. Dimension definitions are the single source of truth for key→field mapping.
- **Resolved Medium: filter templates unvalidated**: added `ALLOWED_FILTER_FIELDS` and `ALLOWED_FILTER_OPERATORS` allowlists in both analytics route and reports service. Filter templates are now validated against these allowlists — unknown fields and unsafe operators (e.g. `$where`, `$regex`) are stripped before query construction.
- **Resolved Medium: analytics/report configurability under-tested**: added comprehensive API integration test covering dimension definition creation, metric with dimensions/groupBy persistence, report definition with dimensions/groupBy/filterTemplate persistence, report execution with grouped output, dashboard computation from configurable metric, and filter operator stripping verification.
