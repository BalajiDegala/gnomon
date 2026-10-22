# Gnomon 2.0

Gnomon is DIGITAL DOMAIN INDIA's workforce management application. It covers
attendance, show timesheets, leave, attendance corrections, approvals, and reporting.
The application uses React, Express, TypeScript, and MongoDB.

## Start the handover here

Read the [plain-language handover runbook](docs/HANDOVER_RUNBOOK.md) first. It covers
HR/admin tasks, local setup, releases, troubleshooting, backups, recovery, and the
ownership checklist.

The [documentation index](docs/README.md) lists the current handover documents.
Older plans and supporting references are preserved in
[the documentation backup](docs/backup/README.md).

## Project layout

| Folder or file                      | Purpose                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `apps/web`                          | Website, forms, navigation, and browser tests                  |
| `apps/api`                          | Server, business rules, imports, database models, and tests    |
| `packages/shared`                   | Shared types, validation rules, and tests                      |
| `deploy`                            | Helm chart, GitOps templates, and CI/CD configuration          |
| `scripts`                           | Delivery setup, verification, and local image helpers          |
| `docs`                              | Current handover documents and a separate backup folder        |
| `Jenkinsfile`                       | Automated build, checks, image publication, and release update |
| `compose.yaml`                      | Local MongoDB, API, and website services                       |
| `.env.example`                      | Environment-variable template with example values              |
| `package.json`, `package-lock.json` | Workspace commands and locked dependencies                     |

## Local setup

Use Node.js 22, npm 10 or later, Docker, and Docker Compose. Follow the
[local setup steps](docs/HANDOVER_RUNBOOK.md#7-running-it-on-a-developers-machine)
for environment settings and initial administrator creation.

The development website uses port 5173. Docker Compose normally uses port 8080;
the local `compose.override.yaml` changes it to 8081. Confirm the effective port
with `docker compose port web 8080`.

API workspace commands need the correct environment-file path. When using a root
`.env`, run `export DOTENV_CONFIG_PATH="$PWD/.env"` from the repository root before
starting the API or seeding an administrator.

## Checks before a release

Run from the repository root:

```bash
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
```

Browser checks need a separately running test application and test accounts. See
[the release procedure](docs/HANDOVER_RUNBOOK.md#8-releasing-a-change) for that
setup and the complete release checks.

## Deployment

The documented lab uses GitLab → Jenkins → SonarQube → Harbor → GitOps → Argo CD
→ Kubernetes. Normal releases follow this path. See
[CI/CD and Kubernetes operations](docs/CI_CD_DEPLOYMENT.md) for the platform setup
and [the runbook](docs/HANDOVER_RUNBOOK.md#8-releasing-a-change) for release and
rollback instructions.

The package version is `0.11.0`. Verify the live revision from Argo CD and image
tags; a package version or an old README does not establish what is running.

## Files to include in the handover

Include the application source and tests, package/lock files, configuration
examples, deployment files, scripts, and current documentation. Review any
uncommitted application work before deciding which revision to hand over.

Installed dependencies, build output, test reports, local environment files,
private notes, and imported employee data are not part of the source handover.
The working machine retains its runtime files and local data so cleanup does not
interrupt existing work. Transfer required credentials and business data through
the team's agreed private process.

The dated archive preserves the pre-cleanup documents. Its `local-only` folder
contains private notes and generated reports, is ignored by Git, and must be left
out of shared folder copies. All of `docs/backup` is excluded from Docker build
contexts and formatting checks.
