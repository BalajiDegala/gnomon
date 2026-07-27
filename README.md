# Gnomon

Gnomon is the DIGITAL DOMAIN INDIA workforce management application described in
[`docs/MVP_PLAN.md`](docs/MVP_PLAN.md). It is a TypeScript MERN monorepo for
attendance reconciliation, website timecards, show/task timesheets, leave,
regularisation, calendars, approval workflows, and scoped administration.

## Current implementation

The Phase 1 foundation and first Phase 2 timecard slice include:

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
- Focused timecard detail view plus clear delivery states for timesheets, leave,
  calendar, approvals, people, and administration.
- Playwright coverage for authenticated desktop and mobile application flows.
- Seeded Employee, Reporting Manager, Show Manager, HR, Attendance Administrator,
  and System Administrator permission sets.
- Development Docker Compose configuration.
- Kubeadm/containerd-compatible Helm chart aligned with the local cluster.

Task entries, full daily reconciliation, regularisation, leave, and approvals
will be added in the following slices.

The accepted attendance CSV contract is documented in
[`docs/ATTENDANCE_CSV_FORMAT.md`](docs/ATTENDANCE_CSV_FORMAT.md).

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
