# Gnomon handover runbook

This guide is for the HR/admin team using Gnomon and the technical team keeping it
running. It explains what to do, what a successful result looks like, and where to
start when something goes wrong.

HR/admin staff can start with sections 1–5. Sections 6–12 are for the technical
team. Everyone should review the open items and handover checklist at the end.

Prepared on **12 October 2026** from the files in this checkout. The application
package version is `0.11.0`. The live deployment, passwords, backups, and user access
were **not checked** while writing this document.

## 1. Start here

Gnomon records employee attendance, time spent on shows, leave requests, and
attendance corrections. HR and managers use it to review requests and reports.
It does not calculate payroll.

If you are taking over today:

1. Complete the ownership and access table below with the outgoing owner.
2. Open the agreed application address and sign in with your own account.
3. Walk through one employee record, one attendance import, and one approval with
   the outgoing owner. Use a test environment for practice changes.
4. Ask the technical owner to record the deployed revision and demonstrate a
   successful backup restore in an isolated environment.
5. Review the unfinished-work list in section 13 before accepting the handover.

Use these sections when you need them:

- [Contacts and access](#2-contacts-and-access-to-hand-over)
- [Day-to-day administration](#4-day-to-day-administration)
- [Daily and monthly checks](#5-routine-checks)
- [Local setup](#7-running-it-on-a-developers-machine)
- [Release and rollback](#8-releasing-a-change)
- [Troubleshooting](#9-when-something-goes-wrong)
- [Backup and recovery](#11-backup-and-recovery)
- [Handover checklist](#14-handover-checklist)

## 2. Contacts and access to hand over

Fill in the blanks together. These details cannot be established from source code.
Record password-manager references here, rather than passwords or tokens.

| Responsibility or item                                          | Name / location / agreed value |
| --------------------------------------------------------------- | ------------------------------ |
| Business owner: attendance and leave decisions                  | To be filled in                |
| HR/attendance operator and backup person                        | To be filled in                |
| Application developer and backup person                         | To be filled in                |
| Infrastructure owner: cluster, network, storage, delivery tools | To be filled in                |
| Support channel and urgent contact                              | To be filled in                |
| Actual environment being handed over: test or production        | To be confirmed                |
| Approved application URL                                        | To be confirmed                |
| Application admin access and password-manager entry             | To be filled in                |
| GitLab source and GitOps repository access                      | To be confirmed                |
| Jenkins, Argo CD, Harbor, and SonarQube access                  | To be confirmed                |
| Kubernetes access and correct cluster context                   | To be confirmed                |
| Runtime secret recovery location                                | To be filled in                |
| Backup location, schedule, retention, and owner                 | To be filled in                |
| Latest successful restore test and evidence                     | To be filled in                |
| Maximum acceptable lost data and recovery time                  | To be agreed                   |
| Deployed source revision and last successful release            | To be recorded                 |
| Pending work, known incidents, and support commitments          | To be recorded                 |

The repository describes the following **lab/test** addresses. Confirm them with
the infrastructure owner; they are not evidence that these services are currently up.

| Service           | Address                                           | What you use it for                      |
| ----------------- | ------------------------------------------------- | ---------------------------------------- |
| Gnomon            | <http://gnomon.d2-india.com>                      | Use the application                      |
| GitLab source     | <http://gitlab.d2-india.com/univrz/gnomon>        | Review application code                  |
| GitOps repository | <http://gitlab.d2-india.com/root/platform-gitops> | Review the requested deployment version  |
| Jenkins           | <http://jenkins.d2-india.com/job/gnomon/>         | Follow builds and releases               |
| Argo CD           | <http://argocd.d2-india.com>                      | Check whether the deployment matches Git |
| Harbor            | <http://harbor.d2-india.com>                      | Find the built container images          |
| SonarQube         | <http://sonar.d2-india.com/dashboard?id=gnomon>   | Review the code quality gate             |

The documented ingress address is `10.191.0.240`. If the lab names do not resolve,
ask the infrastructure owner to confirm DNS and network access.

## 3. Rules that explain most attendance questions

| Rule                                                                    | What it means in everyday use                                                                                           |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Timezone is Asia/Kolkata                                                | Interpret attendance dates and times in India time.                                                                     |
| A workday runs from 7 a.m. to the next day's 7 a.m.                     | A punch at 2 a.m. on Tuesday belongs to Monday's workday.                                                               |
| Normal requirement is 9 hours, Monday to Friday                         | The required duration is 540 minutes. Weekends and configured company holidays have their own status.                   |
| Biometric evidence comes first, then access card, then website sessions | A website session does not automatically fix an incomplete biometric day. Card- or website-led results are provisional. |
| Show timesheets describe work performed                                 | They support attendance review but do not establish official presence. They save directly and have no approval step.    |
| A workday must close before regularisation                              | Monday's correction can be requested after 7 a.m. Tuesday.                                                              |
| Regularisation has two approvals                                        | The reporting manager approves first, then HR/Attendance. Nobody may approve their own request.                         |
| Leave has a department-specific route                                   | It may have one or two stages. Where stage 2 has several approvers, one decision completes that stage.                  |
| Leave routes are copied into each new request                           | Changing today's route does not reroute requests already waiting for approval.                                          |
| Approved half-day leave reduces required attendance to 4.5 hours        | It keeps the worked portion visible. Approved full-day leave sets the day to leave.                                     |
| A leave balance marked “Not set” has not been configured                | It is not a zero balance. Paid leave is not capped by an invented entitlement.                                          |

The present calculation deducts no breaks. HR still needs to confirm the break
policy and the 15-minute threshold used to flag differences between attendance
sources. Do not treat the calculated minutes as a completed payroll calculation.

The current UI uses one company holiday calendar. Older documents describing
branch/location administration describe earlier behavior.

## 4. Day-to-day administration

### Add a person and give them access

1. Find the person in **People** before adding a new record. Attendance imports may
   already have created their profile.
2. Check their employee code, name, real email address, department, employment
   status, and reporting manager. Correct the existing record where appropriate.
3. A System Administrator opens **Administration → Access & roles**, finds the
   employee, and provisions an account with a temporary password of at least
   12 characters. Share the password through the agreed private channel.
4. New accounts receive the Employee role. Add manager, HR, attendance, or admin
   access only where the person's job requires it. Check the scope: it determines
   which people or shows they can manage.
5. Ask the employee to sign in and check the pages they need. For an approver,
   also check their assignment under **Administration → Site preferences**.

**Done when:** the employee can sign in, sees the right pages, and an approver has
both an account with approval permission and an assigned approval route.

A profile created from biometric or door data does not automatically receive a
login. It can have a placeholder email until HR supplies the real one.

### Update the employee directory or approval routes

Use **Administration → Site preferences**. Import `users.csv` first, review the
result, then import `approvals.csv` if department routes need updating.

The directory expects these headers:

```text
Emp ID, User ID, Mail ID, Emp name, New Designation, Dept, Leave Approver 1, Leave Approver 2, Email Triggers
```

Resolve missing or ambiguous approver names before considering the import complete.
The page also identifies approvers who still need login or approval access. The
current workflow uses in-app notifications; an “Email Triggers” field is not proof
that email delivery is configured.

For the department mapping and second-approver rules, see
[Approval route import](backup/2026-10-12/docs/APPROVAL_ROUTE_IMPORT.md).

### Import attendance

1. Obtain the export from the attendance system and keep an original copy in the
   team's approved storage. Confirm its source and date range.
2. Open **Administration → Attendance imports** and choose biometric CSV,
   access-card CSV, or door access workbook as appropriate.
3. Use **Add new punches** for a normal upload. Use **Download template** when
   preparing a CSV manually.
4. Upload and review the accepted, duplicate, ignored, and rejected counts. A
   `partial` result means some rows were accepted and some need attention.
5. Fix rejected identities or source rows, then retry as needed. Check a few
   employees in **Attendance details**, including an overnight record if present.

**Done when:** the expected dates and people appear, the counts make sense, and
every remaining rejection has an explanation and an owner.

Attendance CSVs allow up to 5 MB and 20,000 rows. Door workbooks allow up to 10 MB
and 250,000 transactions. Re-uploading an unchanged, completed file does not add
the punches twice. Door exports count some internal movements and unsuccessful
access attempts as ignored; that is expected.

See [Attendance import formats](ATTENDANCE_CSV_FORMAT.md) for exact columns,
identity matching, accepted timestamps, and file behavior.

### Correct a wrong import

The current checkout includes deletion and period replacement. **Confirm these
changes are deployed before following this procedure**; some related files were
uncommitted when this guide was prepared.

- To remove one mistaken upload, use **Import history → Delete**, review the
  preview, enter a reason, and confirm. Duplicate rows owned by an earlier upload
  are not removed by deleting the later upload.
- To correct punch times, choose **Replace attendance for a period**, select the
  inclusive work dates, upload the complete corrected source data, and review the
  preview before confirming with a reason.

**Replacement covers that source and period for all employees.** An employee left
out of the corrected file can lose their active punches for that period. Review
the affected employee, punch, and workday counts with the attendance owner. Use a
verified backup before a substantial correction. Other sources and approved
corrections remain separate, and the original removed evidence is kept for audit.

### Handle leave, holidays, and corrections

Employees submit leave from **Leave** and attendance corrections from
**Regularisation**. Assigned reviewers use **Approvals**. Rejections need a reason.
Check **Calendar** or **Attendance details** afterward to confirm the outcome.

HR maintains annual leave balances under **Administration → Leave & holidays**.
Pending requests reserve balance and approved requests consume it. Review balances
and company holidays before the new year. A holiday change can be blocked because
it would change the day count of an existing leave request; resolve that request
with HR instead of editing the database.

### Remove access when someone leaves

Review any requests waiting on that person and arrange the appropriate future
approval route. Disable their account in **Access & roles** and mark their
employee profile inactive in **People**. Keep historical attendance and decisions.
Check that the account can no longer be used. Updating approval routes affects
new requests; existing requests may need a System Administrator's audited action.

## 5. Routine checks

These are suggested operating routines. Agree the frequency and named owners at
handover; this repository does not establish an on-call rota or backup schedule.

| When                | Owner                  | Check and expected result                                                                                        |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Each working day    | HR/attendance          | Expected files imported, rejected rows followed up, pending approvals reviewed, unusual attendance explained.    |
| Each working day    | Technical support      | App opens, readiness returns `ready`, no repeated pod failures, latest scheduled backup succeeded if configured. |
| After every release | Developer + operator   | Correct revision is running; sign-in, attendance, reports, and an agreed test workflow work.                     |
| Weekly              | Admin + infrastructure | Review access changes, failed builds, storage capacity, and backup/restore evidence.                             |
| Month end           | HR                     | Reconcile missing imports and outstanding corrections before exporting reports.                                  |
| Before a new year   | HR                     | Confirm next year's company holidays and employee leave entitlements.                                            |

## 6. How the application is put together

```text
Employee's browser
    → React website served by NGINX
    → Express API (the application's server)
    → MongoDB (employee records, attendance, requests, accounts, audit history)
```

| Location                    | What is there                                                     |
| --------------------------- | ----------------------------------------------------------------- |
| `apps/web`                  | Pages, forms, navigation, and browser tests                       |
| `apps/api`                  | Business rules, login, database models, imports, and server tests |
| `packages/shared`           | Types and validation rules used by both web and API               |
| `compose.yaml`              | Local Docker services                                             |
| `deploy/helm/gnomon`        | Kubernetes application templates and default settings             |
| `Jenkinsfile`               | Build, test, image publication, and GitOps update steps           |
| `deploy/gitops`             | Argo CD application template and project permissions              |
| `deploy/cicd/lab.env`       | Non-secret lab addresses and storage settings                     |
| `scripts/bootstrap-cicd.py` | Initial setup and repair of delivery infrastructure               |
| `scripts/check-cicd.py`     | Deployment checks, including an actual admin login                |

The shared platform is documented separately in `/dd/git/kubee` on the original
server. Make sure the incoming infrastructure owner can access that repository too.

## 7. Running it on a developer's machine

Use Node.js 22, npm 10 or later, Docker, and Docker Compose. Run commands from the
repository root. On the original machine that is `/dd/ayon/git/gnomon`; use your
own checkout path elsewhere. Use a development database containing appropriate
test data.

### Development with live code reload

For a fresh checkout without an existing `.env`:

```bash
npm ci
cp .env.example .env
```

Edit `.env`: give both token secrets different random values of at least
32 characters, and set the initial administrator email/password. The admin
password needs at least 12 characters. Confirm `MONGODB_URI` points to your local
development database. Preserve any existing `.env` instead of overwriting it.

```bash
export DOTENV_CONFIG_PATH="$PWD/.env"
npm run dev:db
npm run build --workspace @gnomon/shared
npm run seed:admin --workspace @gnomon/api
npm run dev
```

The explicit environment-file path matters: npm runs API workspace scripts inside
`apps/api`, and the API uses `dotenv/config`. A root `.env` or `.env.local` is not
automatically loaded from that workspace unless its path is supplied.

Open <http://localhost:5173>. The website forwards API calls to port 4000. Log in
using the values you set in `.env`. If you switch between development and Compose,
stop the other API first so you do not have unintended writers on the same database.

The seed command updates an existing administrator's password and profile. Use it
for initial setup or an intentional reset, rather than as a normal startup step.

### Run the complete stack with Docker

```bash
docker compose up --build --detach
docker compose ps
docker compose port web 8080
```

The tracked Compose file publishes the website on port 8080. This checkout also
has an **untracked** `compose.override.yaml` that changes it to 8081 because 8080
is occupied. Compose loads the override automatically. Use the reported port to
choose <http://localhost:8080> or <http://localhost:8081>.

Compose does not seed an administrator automatically. For a new local database,
use the development seed procedure above with `MONGODB_URI` pointing to the
Compose MongoDB on `localhost:27017`. The production API image does not include
the development seed command's source and tooling.

```bash
docker compose logs --tail=100 api web
docker compose stop
```

`stop` keeps the containers and database volume. `docker compose down` also
preserves the named database volume unless `--volumes`/`-v` is supplied.
The sample Compose secrets and unauthenticated MongoDB are for local development.

### Settings you may need to change

| Setting                                                | Purpose                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `MONGODB_URI`                                          | Which database the application uses                                              |
| `WEB_ORIGIN`                                           | The exact browser-facing URL, including scheme and port                          |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`          | Signing keys for login sessions                                                  |
| `COOKIE_SECURE`                                        | Must match the use of HTTPS; the chart derives it from ingress TLS configuration |
| `PORT`                                                 | API listening port, normally 4000                                                |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_EMPLOYEE_CODE` | Initial administrator seed inputs                                                |

Local environment files, private Helm values, and credentials must stay outside
Git. Kubernetes uses the `gnomon-runtime` Secret. Token-key changes affect sessions;
database password changes must be coordinated with the database itself. Changing a
Secret alone does not change the password stored in an existing MongoDB database.

## 8. Releasing a change

The documented lab release path is:

```text
GitLab main → Jenkins checks → SonarQube gate → Harbor images
    → GitOps revision update → Argo CD → Kubernetes
```

Jenkins builds images tagged with the full Git commit ID. Argo CD applies the chart
and images for that same commit. The package version alone does not identify what
is running.

1. Review the intended changes and use the team's agreed branch/review process.
   This working copy was on `local/source-sync-20260821`, at `617487c`, with existing
   modified and untracked application files when the runbook was written. Confirm
   which changes belong in the handover before publishing anything.
2. Run the checks below from the repository root.
3. Review and commit only the intended files. Merge/push the approved change to
   GitLab `main`; that triggers Jenkins.
4. Follow the Jenkins job. A validation or quality-gate failure must be resolved
   before treating the release as successful.
5. Confirm Argo CD reports **Synced** and **Healthy**, then check the actual
   deployment and application workflows.
6. Record the source commit, Jenkins build, release time, and verification result.

```bash
npm ci
npm run format:check
npm run typecheck
npm run test:coverage
npm run build
helm lint deploy/helm/gnomon \
  --set-string secrets.existingSecret=gnomon-runtime \
  --set adminSeed.enabled=true
git diff --check
git status --short
```

For browser changes, also run `npm run e2e --workspace @gnomon/web` against an
isolated test environment. Playwright expects a separately running application;
some tests skip without their login variables. Check for skipped tests before
claiming the workflow passed. The fixture seeder requires `NODE_ENV=test` and a
database name ending in `_test`. See the test files and
[Leave workflow](backup/2026-10-12/docs/LEAVE_CALENDAR_WORKFLOW.md#verification) for the required setup.

### Check the shared deployment

Run these with the confirmed lab Kubernetes context:

```bash
kubectl config current-context
kubectl get application gnomon -n argocd
kubectl get deployments,statefulsets,pods,jobs,services,ingress,pvc -n gnomon
kubectl rollout status deployment/gnomon-gnomon-api -n gnomon --timeout=120s
kubectl rollout status deployment/gnomon-gnomon-web -n gnomon --timeout=120s
kubectl get application gnomon -n argocd \
  -o jsonpath='{.spec.source.targetRevision}{"\n"}{.status.sync.revision}{"\n"}'
kubectl get deployments -n gnomon \
  -o 'custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image'
curl --fail --show-error --max-time 15 http://gnomon.d2-india.com/api/v1/health/ready
```

Readiness should return HTTP 200 with `status: ready` and `database: up`.
The lab template requests two API and two web replicas, and one MongoDB replica.
Compare the requested revision, synced revision, and image tags.

The wider check is:

```bash
python3 scripts/check-cicd.py deploy/cicd/lab.env
```

It needs permission to read application and platform secrets. It checks deployment
state, storage, images, Jenkins, and health, then signs in with the admin credentials
from `gnomon-runtime`. That login updates the account's last-login time. A failed
login check can mean the stored seed password differs from the current account
password; inspect the individual failure before deciding the service is down.

### Roll back a bad release

For a normal application rollback, revert the offending source change through the
team's review process and let Jenkins release the revert. For urgent recovery,
the infrastructure owner can revert the deployment change in
`root/platform-gitops`, restoring the chart revision and all three image tags
together to a known working commit. Coordinate with any running Jenkins build so
it does not immediately publish the bad version again.

Repeat deployment and user checks afterward. An image rollback does not undo
database changes or an attendance import. Confirm data compatibility before using
an older image against newer data.

Argo CD automatically corrects live changes back to Git. Do not use `helm rollback`
or manually change image tags on the Argo-managed application. Standalone Helm
instructions in [Local images](backup/2026-10-12/docs/LOCAL_DOCKER_IMAGES.md) apply to separately managed
installations.

## 9. When something goes wrong

First record the affected environment, time in India time, page/action, exact error,
and whether one person or everyone is affected. Include an employee code and work
date when relevant. Avoid sharing passwords, tokens, or private leave reasons in
incident notes.

| Problem                                           | Start here                                                                                                                                                        | Escalate to                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Website does not open                             | Check the agreed URL and network/DNS. Compare `/healthz` (web server) with `/api/v1/health/live` (API) and `/api/v1/health/ready` (API database connection).      | Infrastructure if routing fails; developer if the API fails |
| Login fails for one person                        | Check active employee profile, active login account, and email in Access & roles. Reset the password if appropriate; this revokes their existing sessions.        | System Administrator                                        |
| User cannot see a page or request                 | Check role scope as well as role name. For leave, check the approvers saved on that request.                                                                      | System Administrator / HR                                   |
| Hours or date look wrong                          | Check the 7 a.m. boundary, timezone, selected source, whether the day is closed, and missing punches.                                                             | Attendance operator                                         |
| CSV is partial or rejected                        | Read the row errors. Check names/codes, inactive employees, headers, and timestamps.                                                                              | Attendance operator, then developer                         |
| Upload returns HTTP 413                           | Check the file limit and proxy settings. Local `apps/web/nginx.conf` has no explicit upload-size increase, so the proxy can reject a file before the API's limit. | Developer / infrastructure                                  |
| Import remains locked after an interruption       | Stop further attempts and follow section 10.                                                                                                                      | Developer + infrastructure                                  |
| Leave approval does not reach the expected person | Check the request's saved route, approver account, and role. Later route changes do not change pending requests.                                                  | HR / System Administrator                                   |
| Show is missing from the new-entry list           | Confirm the show's status is active. Historical entries can retain a closed show.                                                                                 | Show Manager                                                |
| Jenkins is red                                    | Open the first failed stage; compare its source commit with the intended change.                                                                                  | Developer, or infrastructure for connectivity/credentials   |
| Argo CD is OutOfSync or Degraded                  | Check the requested source revision, image availability, pod events, and completed seed job.                                                                      | Infrastructure                                              |
| MongoDB pod is Pending or restarting              | Check its PVC, storage node, disk space, and logs.                                                                                                                | Infrastructure immediately                                  |

Useful diagnostics for the technical owner:

```bash
kubectl get events -n gnomon --sort-by=.lastTimestamp
kubectl logs -n gnomon -l app.kubernetes.io/component=api \
  --all-containers=true --prefix=true --tail=100
kubectl logs -n gnomon statefulset/gnomon-gnomon-mongodb --tail=100
kubectl get pv gnomon-mongodb
kubectl describe pvc data-gnomon-gnomon-mongodb-0 -n gnomon
```

For a restarting pod, use `kubectl describe pod <pod-name> -n gnomon` and
`kubectl logs <pod-name> -n gnomon --previous --tail=100`. Replace the placeholder
with the affected pod. Capture the error before trying a restart.

The full platform troubleshooting guide is [CI/CD deployment](CI_CD_DEPLOYMENT.md).
Its bootstrap script changes credentials, publishes delivery files, and queues a
build. Use it for a planned setup/repair with the infrastructure owner, rather
than as a first response to an ordinary application error.

## 10. Recover an interrupted attendance change

This applies to the import delete/replace implementation in the current checkout.
Confirm the running API image includes `recover-attendance-change.js` first.

The import lock prevents another writer from changing attendance while recovery is
incomplete. Do not delete the lock manually. Stop **every** API, import process,
and other attendance writer using that database before recovery.

For the local Compose deployment, after confirming the above:

```bash
docker compose stop api
docker compose run --rm --no-deps api \
  node apps/api/dist/scripts/recover-attendance-change.js --writers-stopped
```

Continue only if the command succeeds and reports that attendance changes were
recovered and the import lock released:

```bash
docker compose up -d api
```

Check readiness, import history, and affected employee workdays before retrying
the original task. If recovery fails, keep writers stopped and give the error to
the developer; the flag is an operator confirmation, not a mechanism that stops
writers for you.

For Kubernetes, the infrastructure owner must stop writers through the GitOps
maintenance process, then run the recovery command in a one-off Job using the
same API image and runtime environment. Scaling the API down live without
coordinating Argo CD can let it start again during recovery.

## 11. Backup and recovery

The configured lab database is a single MongoDB instance. Its files are on
`dd-test.d2-india.com` at `/pipedev/k8s-local/gnomon-mongodb`, using the retained
`gnomon-mongodb` volume. Losing that node or disk can take the database offline.
A retained volume is not a separate backup.

No scheduled database backup or restore-test automation was found in this
repository. Confirm whether the infrastructure team supplies it elsewhere. Agree
backup frequency, retention, off-node storage, and recovery targets before handover.

The following is a **manual procedure to rehearse**, not a claim that a backup or
restore has already been tested here.

### Take a consistent backup

1. Arrange a maintenance window. Stop all database writers: application APIs,
   import scripts, seed jobs, and any other tools with write access. Keep MongoDB
   running. For this standalone database, writes during a dump can leave related
   records from different moments in time.
2. For the Argo-managed lab, have the infrastructure owner record current settings,
   pause releases, and set API replicas to zero and admin seeding off through the
   GitOps configuration. Ensure the change has synced and no writers remain.
   The website may show errors until service resumes. For local Compose, stop the
   API and all host-side writers instead.
3. Check free space in the database container's temporary storage and on the backup
   destination. Use a MongoDB Database Tools version compatible with this server;
   record `mongodump --version` and `mongorestore --version` for the restore test.
4. On an authorized operator machine, create a protected destination **outside the
   repository**, then run the Kubernetes example below. It prompts for the
   database password from the approved password manager.

```bash
umask 077
GNOMON_BACKUP_DIR=/absolute/path/to/approved-backup-directory
GNOMON_BACKUP_NAME="gnomon-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
mkdir -p "$GNOMON_BACKUP_DIR"
kubectl exec -it -n gnomon gnomon-gnomon-mongodb-0 -- \
  mongodump --host=127.0.0.1 --username=gnomonadmin \
  --authenticationDatabase=admin --db=gnomon \
  --archive="/tmp/$GNOMON_BACKUP_NAME" --gzip
```

After the dump exits successfully:

```bash
kubectl cp -n gnomon \
  "gnomon-gnomon-mongodb-0:/tmp/$GNOMON_BACKUP_NAME" \
  "$GNOMON_BACKUP_DIR/$GNOMON_BACKUP_NAME"
test -s "$GNOMON_BACKUP_DIR/$GNOMON_BACKUP_NAME"
gzip -t "$GNOMON_BACKUP_DIR/$GNOMON_BACKUP_NAME"
sha256sum "$GNOMON_BACKUP_DIR/$GNOMON_BACKUP_NAME"
```

Check every command's result before proceeding. Record the per-collection document
counts from the successful dump output, checksum, dump/tool versions, deployed
revision, and backup time. Store an encrypted copy away from
the database node and verify the copied file's checksum. Remove the temporary
archive from the pod after verified transfer. Restore the recorded GitOps settings
and confirm application health before ending the maintenance window.

For local Compose, the equivalent dump command is below; use the same protected
directory and unique filename. The provided local database has no authentication.

```bash
docker compose exec -T mongo mongodump --db=gnomon --archive --gzip \
  > "$GNOMON_BACKUP_DIR/$GNOMON_BACKUP_NAME"
```

Check the dump result, file, and checksum before restarting writers. MongoDB
documents password prompting and compressed archives in its
[mongodump reference](https://www.mongodb.com/docs/database-tools/mongodump/).

This application-database dump does not replace a protected recovery copy of the
runtime secrets, database authentication setup, GitOps configuration, or original
import files. Record where those are held separately.

### Prove that the backup restores

Use an isolated, empty MongoDB instance with a compatible server/tools version.
Point `GNOMON_BACKUP_DIR` and `GNOMON_BACKUP_NAME` to the archive you are testing.
This Docker example has no published ports or external network connection:

```bash
docker run --detach --name gnomon-restore-check --network none mongo:4.4.29
docker exec gnomon-restore-check mongo --quiet \
  --eval "db.adminCommand('ping').ok"
```

Wait for a successful ping, then:

```bash
docker cp "$GNOMON_BACKUP_DIR/$GNOMON_BACKUP_NAME" \
  gnomon-restore-check:/tmp/gnomon.archive.gz
docker exec gnomon-restore-check mongorestore \
  --archive=/tmp/gnomon.archive.gz --gzip --stopOnError \
  --nsInclude='gnomon.*' \
  --nsFrom='gnomon.*' --nsTo='gnomon_restore_check.*'
docker exec gnomon-restore-check mongo --quiet gnomon_restore_check \
  --eval 'db.getCollectionNames().sort().forEach(function(name) { print(name + ": " + db.getCollection(name).countDocuments({})); })'
```

Check the restore exit status and collection counts against the backup record.
Have the developer inspect representative attendance, leave, user, and audit
records, then perform an application restore rehearsal in an isolated environment.
Record the outcome and time taken. A successful `gzip` check alone does not prove
that the application data can be recovered. Clean up the disposable restore
container and its data when the rehearsal is finished.

The archive and database-renaming options are described in MongoDB's
[mongorestore reference](https://www.mongodb.com/docs/database-tools/mongorestore/).

### Recover the service after data loss

The infrastructure owner and application owner should run the recovery together:

1. Stop writers and release automation. Record the failed state and preserve
   recoverable data before attempting repairs.
2. Select a verified backup and agree with HR which newer changes may be lost.
3. Restore into a clean replacement database/volume using compatible versions.
   For a real replacement, restore the original `gnomon` database name; the
   renamed database above is only for rehearsal. Configure database authentication
   and restore required runtime settings from the protected recovery records.
4. Verify records, indexes, and any interrupted attendance change with the developer.
   Resolve an outstanding import recovery lock before enabling writers.
5. Point the application to the recovered database, restore the agreed GitOps
   settings, then check health, login, recent attendance, approvals, and reports.
6. Have HR reconcile activity after the backup time and decide which original
   imports or user actions need to be repeated.

Do not restore over a running database or delete the existing storage as a
troubleshooting shortcut. If storage moves, update both `deploy/cicd/lab.env` and
`deploy/cicd/storage.yaml` and plan the PV/PVC rebinding with the infrastructure owner.

## 12. Administrator credentials need special attention

The lab template enables a seed Job for each new revision. The current
`seed-admin.ts` uses an update operation that resets the configured administrator's
password, email, active status, and parts of the employee profile. It is not only
an “insert if missing” operation.

If someone changes that account's password only in the UI, a later deployment can
set it back to `ADMIN_PASSWORD` from `gnomon-runtime`. Before handover, agree how
the seed account and normal named administrator accounts will be maintained.
Record whether the team will coordinate seed credentials or change/disable this
behavior through a reviewed code/configuration change. This runbook does not
change that behavior.

## 13. Known gaps and unfinished work to discuss

| Item                                                                                 | Handover action                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modified/untracked application work exists in this checkout                          | Review `git status --short`; record what is committed, tested, deployed, or still pending. Include import deletion/replacement and identity changes in that review. |
| Local Compose override is untracked                                                  | Decide whether the next developer needs the 8081 override and transfer its non-secret configuration deliberately.                                                   |
| The archived README contains historical release/remote information                   | Establish the actual environment from GitLab, Argo CD, and deployed image tags. Use the current README; do not use the archived release table as live status.       |
| Backup ownership and restore evidence are not established here                       | Assign an owner and complete a restore rehearsal.                                                                                                                   |
| Database depends on one local-storage node                                           | Agree recovery expectations for loss of `dd-test` or its disk.                                                                                                      |
| Administrator seed can reset a password on release                                   | Resolve the ownership and credential policy in section 12.                                                                                                          |
| Repository lab addresses use HTTP and the ingress template has no TLS configured     | Confirm the intended environment. Plan HTTPS and matching cookie/origin settings before use that requires a secured deployment.                                     |
| Attendance break deductions and source mismatch threshold need business confirmation | Get HR's decision; keep payroll outside the current scope.                                                                                                          |
| UI recovery, accessibility, and performance work is tracked separately               | Review [MVP stabilization backlog](MVP_STABILIZATION_BACKLOG.md) against the current implementation and assign remaining work.                                      |

The MVP also excludes mobile/geolocation attendance, configurable shifts, payroll,
and a general approval-policy designer. Avoid promising these during handover.

## 14. Handover checklist

- [ ] Business, technical, infrastructure, and backup owners are named.
- [ ] The incoming team can reach the agreed environment and sign in.
- [ ] Required source, delivery-tool, Kubernetes, and password-manager access works.
- [ ] The current deployed commit and last successful release are recorded.
- [ ] Uncommitted work and known gaps have an explicit owner and disposition.
- [ ] HR has demonstrated directory maintenance, an attendance import, and approvals.
- [ ] The technical owner has demonstrated health checks and explained rollback.
- [ ] A backup is stored off-node and a restore rehearsal has passed.
- [ ] The seed administrator behavior and access removal process are understood.
- [ ] Support contacts, backup schedule, recovery targets, and pending work are agreed.
- [ ] Outgoing owner, incoming owner, and acceptance date are recorded below.

| Sign-off                                     | Name / date / notes |
| -------------------------------------------- | ------------------- |
| Outgoing owner                               | To be filled in     |
| Incoming owner                               | To be filled in     |
| Business/HR representative                   | To be filled in     |
| Infrastructure representative                | To be filled in     |
| Acceptance date and remaining agreed actions | To be filled in     |

## 15. Detailed references

The main handover documents are listed in the [documentation index](README.md).
Optional workflow and older deployment references are preserved under
[the dated backup](backup/README.md); links below point to their saved locations.

- [CI/CD and Kubernetes operations](CI_CD_DEPLOYMENT.md)
- [Local images and standalone Helm deployment](backup/2026-10-12/docs/LOCAL_DOCKER_IMAGES.md)
- [Attendance files and import recovery](ATTENDANCE_CSV_FORMAT.md)
- [Attendance calculation rules](backup/2026-10-12/docs/RECONCILIATION_POLICY.md)
- [Regularisation workflow](backup/2026-10-12/docs/REGULARISATION_WORKFLOW.md)
- [Leave and calendar workflow](backup/2026-10-12/docs/LEAVE_CALENDAR_WORKFLOW.md)
- [Approval route import](backup/2026-10-12/docs/APPROVAL_ROUTE_IMPORT.md)
- [Show timesheets](backup/2026-10-12/docs/TIMESHEET_WORKFLOW.md)

Maintain this runbook whenever the deployment path, settings, business rules, or
recovery procedure changes. Record a new review date and recheck affected steps.
