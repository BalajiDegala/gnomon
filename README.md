# Gnomon

Gnomon is the DIGITAL DOMAIN INDIA workforce management application described in
[`docs/MVP_PLAN.md`](docs/MVP_PLAN.md). It is a TypeScript MERN monorepo for
attendance reconciliation, website timecards, show/task timesheets, leave,
regularisation, calendars, approval workflows, and scoped administration.

## Current implementation

The Phase 1 foundation and Phase 2–5 attendance, task-time, correction, leave, and
personal-calendar slices include:

- Responsive React and Material UI application shell with a polished login page,
  permission-aware navigation, desktop sidebar, and mobile drawer.
- Express API with health probes and centralized errors.
- MongoDB employee, user, role, and scoped role-assignment models.
- JWT access tokens and HTTP-only refresh sessions.
- Shared permission, scope, login, and workday policy definitions.
- Employee website start/stop sessions with a database-enforced single-running-session rule.
- Live timecard dashboard with a nine-hour progress view, three attendance-signal
  cards, session history, and correct 07:00-to-07:00 work-date assignment.
- Company-scoped biometric and access-card CSV imports with file/row idempotency,
  immutable raw events, validation results, and import history.
- Permission-to-scope authorization grants for protected company-wide actions.
- Company- or show-scoped show administration with task creation and employee
  assignment by employee code.
- Employee task-time entries for assigned shows, including start/end intervals,
  descriptions, billable flags, work-session linkage, overlap protection, daily
  totals, draft deletion, and daily submission.
- Scoped submitted-timesheet approval for exact shows, direct reports, and company
  administration, with self-approval prevention, atomic decisions, mandatory
  rejection reasons, and immutable actor history shown back to the employee.
- Persisted daily reconciliation across biometric, access-card, website-session,
  and task-time evidence with source precedence, open/closed workday handling,
  nine-hour calculation, and discrepancy detection.
- Responsive reconciliation dashboard showing source totals, primary evidence,
  provisional state, attendance result, and review anomalies.
- Employee missed-biometric and website start/stop regularisation requests with
  closed-workday validation, duplicate prevention, cancellation, and status history.
- Two-step Reporting Manager then HR/Attendance approval, strict direct-report/
  company/department/location scope enforcement, self-approval prevention, and
  immutable decision history.
- Approved corrections finalise the daily timecard while preserving all imported
  biometric, access-card, and website evidence.
- Casual, sick, earned, and unpaid leave requests with full-day or single-day
  half-day support, weekend exclusion, overlap prevention, cancellation, and
  private employee reasons.
- Optional annual paid-leave balances that are enforced when configured and shown
  explicitly as not configured otherwise; the MVP does not invent entitlements.
- Single-step Reporting Manager leave approval with direct-report scope and
  self-approval prevention.
- Approved full-day leave finalises the effective attendance state while keeping
  source evidence intact; approved half-day leave reduces the attendance requirement
  to 270 minutes and retains the worked portion.
- Responsive personal calendar combining reconciled attendance with pending and
  approved leave without exposing leave reasons.
- Scoped Reporting Manager direct-report calendars and Show Manager assigned-artist
  availability calendars with responsive month matrices and private-reason redaction.
- Assignment-date enforcement that prevents show-scoped viewers from seeing attendance,
  leave, or holiday signals outside an artist's show assignment window.
- Auditable company- and studio-location holiday administration with scope
  enforcement, archive/reactivate support, leave-range conflict protection, and
  automatic exclusion from leave days.
- Studio-location directory and effective-dated employee assignment history, with
  company and exact-location RBAC/ABAC capabilities shown in the Administration UI.
- Location-aware personal calendars, leave-day calculation, attendance
  reconciliation, and policy changes that preserve historical assignment meaning.
- HR-scoped employee leave-balance administration for annual entitlement, signed
  adjustment, usage, availability, and notes.
- Permission-aware Administration workspace that exposes attendance imports, studio
  locations, employee-location assignment, holiday policy, and/or leave balances
  according to each role grant.
- Responsive Shows & tasks and Timesheets pages for desktop and mobile.
- Focused timecard detail view plus operational leave, calendar, approvals, show,
  timesheet, import, and regularisation pages.
- Playwright coverage for authenticated desktop and mobile application flows.
- Seeded Employee, Reporting Manager, Show Manager, HR, Attendance Administrator,
  and System Administrator permission sets.
- Development Docker Compose configuration.
- Kubeadm/containerd-compatible Helm chart aligned with the local cluster.

Project-level task grouping and manager reconciliation queues remain for the following
slices.

The accepted attendance CSV contract is documented in
[`docs/ATTENDANCE_CSV_FORMAT.md`](docs/ATTENDANCE_CSV_FORMAT.md).
The show setup and employee task-time workflow is documented in
[`docs/TIMESHEET_WORKFLOW.md`](docs/TIMESHEET_WORKFLOW.md).
The daily calculation and provisional policy are documented in
[`docs/RECONCILIATION_POLICY.md`](docs/RECONCILIATION_POLICY.md).
The attendance correction and approval workflow is documented in
[`docs/REGULARISATION_WORKFLOW.md`](docs/REGULARISATION_WORKFLOW.md).
The leave, approval, balance, calendar, and attendance interaction is documented in
[`docs/LEAVE_CALENDAR_WORKFLOW.md`](docs/LEAVE_CALENDAR_WORKFLOW.md).
Location, holiday, and leave-balance administration is documented in
[`docs/POLICY_ADMINISTRATION.md`](docs/POLICY_ADMINISTRATION.md).
Manager and show availability calendars are documented in
[`docs/TEAM_CALENDAR_WORKFLOW.md`](docs/TEAM_CALENDAR_WORKFLOW.md).

## Release status

| Item                     | Status                                      |
| ------------------------ | ------------------------------------------- |
| Source and Helm version  | `0.10.0`                                    |
| Git branch               | `main`                                      |
| Source release commit    | Current `0.10.0` feature commit             |
| Local Kubernetes release | `0.9.0`, Helm revision 11, deployed         |
| Local `0.10.0` images    | Awaiting local build and containerd import  |
| Container target         | kubeadm/containerd `k8s.io`, `linux/amd64`  |
| Ingress                  | `http://gnomon.local` through NGINX Ingress |

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- Docker with Compose

## Local development

```bash
cp .env.example .env
npm install
npm run dev:db
npm run seed:admin --workspace @gnomon/api
npm run dev
```

The web application runs at `http://localhost:5173` and proxies API requests to
`http://localhost:4000`. Change the example secrets and administrator password
before running the seed command.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run format:check
npm run e2e --workspace @gnomon/web
```

## Git workflow

This workspace is a Git repository on the `main` branch. The initial tracked
baseline is commit `aec2463` (`feat: establish gnomon attendance MVP v0.2.0`).

Each completed implementation slice must be committed separately after its
relevant type checks, tests, build, formatting, and deployment checks pass. Use
clear conventional commit messages such as:

```text
feat: add regularisation request workflow
fix: prevent overlapping task time entries
docs: document MongoDB restore procedure
```

Generated output, local environment files, test artifacts, private Helm values,
and credentials must remain untracked. Before every commit, verify:

```bash
git status --short
git diff --check
git diff --cached --check
```

No Git remote is configured yet. Once a repository URL is available, configure
and publish `main` with:

```bash
git remote add origin <repository-url>
git push --set-upstream origin main
```

## Docker Compose

Build and run the complete current stack at `http://localhost:8080`:

```bash
docker compose up --build
```

The credentials in `compose.yaml` are development-only and must not be reused in
another environment.

## Kubernetes

The complete local image build, registry, containerd import, and Helm deployment
workflow is documented in
[`docs/LOCAL_DOCKER_IMAGES.md`](docs/LOCAL_DOCKER_IMAGES.md).

For the current single-node kubeadm server, build and import the source release
with one command. The script reads the version from `package.json` and prompts
for sudo only where Docker/containerd access requires it:

```bash
./scripts/build-import-local-images.sh
```

The initial Helm chart is in `deploy/helm/gnomon`. Supply secrets using an
uncommitted values file. For example:

```yaml
secrets:
  accessTokenSecret: 'a-long-random-access-token-secret'
  refreshTokenSecret: 'a-different-long-random-refresh-secret'
  mongodbRootPassword: 'a-url-safe-mongodb-password'
  mongodbUri: 'mongodb://gnomonadmin:a-url-safe-mongodb-password@gnomon-gnomon-mongodb:27017/gnomon?authSource=admin'
```

Then render or install it:

```bash
helm lint deploy/helm/gnomon -f private-values.yaml
helm upgrade --install gnomon deploy/helm/gnomon \
  --namespace gnomon --create-namespace -f private-values.yaml
```

Real secrets and private values files must never be committed.
