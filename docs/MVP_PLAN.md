# DIGITAL DOMAIN INDIA Workforce Management MVP

## Document status

- Status: MVP feature scope complete and locally validated for release `0.11.0`
- Created: 2026-07-27
- Last updated: 2026-08-02
- Company: DIGITAL DOMAIN INDIA
- Application scope: Single company
- Technology direction: MERN, TypeScript, Docker, and Kubernetes
- Working timezone: Asia/Kolkata

This document is the release baseline for the attendance, timecard/timesheet,
leave, regularisation, calendar, administration, authorization, and reporting
system. Payroll and mobile/geolocation capabilities are not required for this MVP.

## 1. Product goals

The MVP gives employees one website where they can:

- Start and stop their workday.
- Select any active show and record start/end time with a work comment and progress
  from 10% to 100% in ten-percent steps.
- View their attendance and source discrepancies.
- Request leave.
- Request regularisation for missed biometric or website events.
- View approval status and their work calendar.

Managers, Show Managers, HR, and administrators can:

- Review attendance and availability within their authorized scope.
- Approve or reject requests according to versioned MVP approval rules.
- Import biometric and access-card CSV files.
- Investigate missing punches and mismatched source data.
- Configure employees, reporting relationships, shows, locations,
  holidays, leave balances, login accounts, and scoped system roles.
- Run scoped attendance, leave, regularisation, and timesheet reports and export CSV.
- Retain immutable attribution for approvals and sensitive employee/security changes.

## 2. MVP roles

- Employee
- Reporting Manager
- Show Manager
- HR
- Attendance Administrator
- System Administrator

A user may hold more than one role. A role grants capabilities, while attribute
scope determines the employees, shows, departments, locations, or company data
on which those capabilities may be used.

## 3. Sources of attendance evidence

The system will reconcile three independent sources:

1. Biometric events, initially imported from CSV and later received through an
   API.
2. Access-card entry/exit events, initially imported from CSV and later capable
   of using an API.
3. Website work-session start/stop events entered by the employee.

Show time entries provide additional supporting evidence but do not replace
official attendance events.

```text
Biometric CSV/API ----+
Access-card CSV/API --+--> Raw events --> Daily attendance reconciliation
Website start/stop ---+                         |
                                                +--> Status and anomalies
Show time entries ------------------------------+--> Hours and discrepancies
Regularisation ---------------------------------+--> Final attendance
```

Raw imported biometric and access-card events are immutable. A correction is
stored as an approved regularisation or explicit HR override, preserving the
original data and audit trail.

## 4. Workday policy

Current baseline:

- Standard shift: 09:00 to 18:00.
- Required duration: 540 minutes (9 hours).
- Attendance window for a work date: 07:00 on that date to 07:00 the following
  date.
- Workweek: Monday to Friday.
- Timezone: Asia/Kolkata.
- Cross-midnight work is supported.

Example: a session from Monday 20:00 to Tuesday 05:00 belongs to Monday's work
date. The attendance boundary, shift, required duration, grace periods, break
rules, timezone, and workweek must be configuration rather than hardcoded logic.

## 5. Domain terminology

The UI may use **Timecard / Timesheet** as familiar terms. The internal model
separates the concepts:

- `attendance_events`: immutable source punches and corrective events.
- `work_sessions`: employee website start/stop sessions.
- `time_entries`: show-level start/end intervals with work comments and progress.
- `daily_timecards`: reconciled daily attendance summary.
- `regularisation_requests`: requested corrections and their approval history.
- `leave_requests`: private leave requests, reserved working dates, and manager decision.
- `leave_balances`: optional annual paid-leave entitlement and adjustment records.

This separation prevents show-time edits or website activity from silently modifying
official biometric records.

## 6. Core data model

### 6.1 `daily_timecards`

One record per employee and company work date.

```ts
{
  _id: ObjectId,
  employeeId: ObjectId,
  workDate: "2026-07-27",
  timezone: "Asia/Kolkata",

  schedule: {
    scheduleId: ObjectId,
    windowStart: ISODate,
    windowEnd: ISODate,
    expectedStart: ISODate,
    expectedEnd: ISODate,
    requiredMinutes: 540
  },

  sourceSummary: {
    biometric: {
      firstIn: ISODate | null,
      lastOut: ISODate | null,
      workedMinutes: number,
      eventCount: number,
      status: "complete" | "missing_in" | "missing_out" | "none"
    },
    accessCard: {
      firstEntry: ISODate | null,
      lastExit: ISODate | null,
      presenceMinutes: number,
      eventCount: number,
      status: "complete" | "incomplete" | "none"
    },
    webTimecard: {
      firstStart: ISODate | null,
      lastStop: ISODate | null,
      workedMinutes: number,
      sessionCount: number,
      status: "running" | "complete" | "incomplete" | "none"
    },
    showEntries: {
      totalMinutes: number,
      entryCount: number,
      averageProgress: number
    }
  },

  calculated: {
    attendanceStart: ISODate | null,
    attendanceEnd: ISODate | null,
    grossMinutes: number,
    breakMinutes: number,
    payableMinutes: number,
    requiredMinutes: 540,
    differenceMinutes: number,
    status:
      | "present"
      | "partial"
      | "absent"
      | "leave"
      | "holiday"
      | "weekend"
      | "pending_regularisation",
    anomalies: [
      "missing_biometric_in" |
      "missing_biometric_out" |
      "missing_web_start" |
      "missing_web_stop" |
      "source_time_mismatch" |
      "insufficient_hours" |
      "show_time_outside_web_session" |
      "show_time_exceeds_presence"
    ]
  },

  regularisationStatus:
    "not_required" | "draft" | "pending" | "approved" | "rejected",

  finalisation: {
    isFinal: boolean,
    finalSource:
      "calculated" | "regularised" | "approved_leave" | "holiday" | "hr_override",
    finalStart: ISODate | null,
    finalEnd: ISODate | null,
    finalMinutes: number,
    finalisedBy: ObjectId | null,
    finalisedAt: ISODate | null
  },

  version: number,
  createdAt: ISODate,
  updatedAt: ISODate
}
```

Required unique index:

```ts
{ employeeId: 1, workDate: 1 }
```

### 6.2 `attendance_events`

```ts
{
  _id: ObjectId,
  employeeId: ObjectId,
  source:
    "biometric" | "access_card" | "web" | "regularisation" | "admin",
  eventType: "in" | "out" | "entry" | "exit" | "start" | "stop",
  occurredAt: ISODate,
  workDate: "2026-07-27",
  sourceEmployeeCode: string,
  sourceEventId: string | null,
  importBatchId: ObjectId | null,
  device: {
    deviceId: string | null,
    deviceName: string | null,
    locationId: ObjectId | null
  },
  rawPayload: object,
  isSynthetic: boolean,
  correctionRequestId: ObjectId | null,
  createdAt: ISODate
}
```

Controls:

- Imported events cannot be edited or deleted through the application UI.
- Each imported row gets a stable fingerprint to prevent duplicate ingestion.
- Re-importing the same file must be idempotent.
- Unmatched employees and invalid rows go to an administrator review queue.

### 6.3 `import_batches`

```ts
{
  _id: ObjectId,
  source: "biometric" | "access_card",
  importType: "csv" | "api",
  fileName: string,
  fileHash: string,
  periodStart: ISODate,
  periodEnd: ISODate,
  totalRows: number,
  successfulRows: number,
  failedRows: number,
  duplicateRows: number,
  status: "processing" | "completed" | "partial" | "failed",
  importedBy: ObjectId,
  errors: [{
    rowNumber: number,
    employeeCode: string,
    reason: string
  }],
  createdAt: ISODate
}
```

### 6.4 `work_sessions`

```ts
{
  _id: ObjectId,
  employeeId: ObjectId,
  workDate: "2026-07-27",
  startedAt: ISODate,
  stoppedAt: ISODate | null,
  durationMinutes: number | null,
  status: "running" | "completed" | "force_stopped" | "regularised",
  startMetadata: {
    ipAddress: string,
    userAgent: string
  },
  stopMetadata: {
    ipAddress: string | null,
    userAgent: string | null
  },
  stoppedBy: ObjectId | null,
  correctionRequestId: ObjectId | null,
  createdAt: ISODate,
  updatedAt: ISODate
}
```

Rules:

- An employee can have only one running session.
- A stop cannot precede its start.
- Cross-midnight sessions are allowed inside the assigned workday window.
- A session still open at the following 07:00 receives a
  `missing_web_stop` anomaly.
- Corrections require an audited regularisation or administrator action.

### 6.5 `time_entries`

```ts
{
  _id: ObjectId,
  employeeId: ObjectId,
  workDate: "2026-07-27",
  showId: ObjectId,
  workSessionId: ObjectId | null,
  startedAt: ISODate,
  endedAt: ISODate,
  durationMinutes: number,
  comment: string,
  percentage: number,
  createdAt: ISODate,
  updatedAt: ISODate
}
```

Rules:

- Start and end are mandatory and end must follow start.
- Entries for the same employee cannot overlap.
- Every active show is available to every employee; no show or task assignment exists.
- Comment is mandatory and describes the task or work performed.
- Progress must be 10%, 20%, through 100%.
- Show time outside website work sessions is flagged for review.
- Show time exceeding presence time is flagged for review.
- Entries are saved directly and may be edited or deleted by their employee owner.
- Deletion requires confirmation, and previous/next-day controls retain the selected date
  in the page URL.
- Show code, name, and lifecycle status are editable by an authorized Show Manager.
- Inactive shows are unavailable to new entries, while their historical entries remain
  readable and editable without changing the show.
- Timesheets have no draft, submission, approval, rejection, or approver-routing state.

## 7. Reconciliation policy

Recommended evidence precedence:

1. Approved regularisation or explicit HR override.
2. Biometric attendance.
3. Access-card evidence.
4. Website work-session start/stop.
5. Show time as supporting evidence.

A lower-priority source may support a regularisation request but must not silently
replace a missing higher-priority event. Source-time mismatch tolerances will be
configured in the attendance policy.

## 8. RBAC and ABAC

RBAC determines which operations a role can perform. ABAC scopes those
operations to the applicable employee, direct reports, shows, departments,
locations, or the entire company.

Example permission codes:

```text
employee:read
employee:update
attendance:self:read
attendance:team:read
attendance:all:read
regularisation:create
regularisation:approve
leave:create
leave:approve
timesheet:create
show:manage
imports:create
policy:manage
audit:read
```

Example role assignment:

```ts
{
  userId: ObjectId,
  roleId: ObjectId,
  scopeType:
    "self" |
    "direct_reports" |
    "show" |
    "department" |
    "location" |
    "company",
  scopeIds: [ObjectId],
  validFrom: ISODate,
  validUntil: ISODate | null,
  grantedBy: ObjectId
}
```

Authorization rules are enforced by the API. Hiding pages and buttons in React
is only a user-interface convenience and is not a security boundary. Self
approval is disabled unless an explicit future policy allows it.

## 9. Recommended approval ownership

| Request                         | Primary approver                            | HR responsibility              | Show Manager responsibility |
| ------------------------------- | ------------------------------------------- | ------------------------------ | --------------------------- |
| Leave                           | Reporting Manager                           | View, override, administration | View affected show absence  |
| Missed biometric regularisation | Reporting Manager, then HR/Attendance Admin | Final approval or override     | View staffing impact        |
| Website start/stop correction   | Reporting Manager, then HR/Attendance Admin | Final approval or override     | No approval                 |
| Employee profile change         | HR                                          | Maintain records               | No approval                 |

Timesheets are direct employee records and do not enter an approval workflow.
`REGULARISATION_V1` and `LEAVE_V1` remain the fixed MVP baselines. A general policy
designer is outside this MVP.

## 10. Leave and calendar

- Saturday and Sunday are non-working days by default.
- Release `0.6.0` excludes weekends and supports casual, sick, earned, and unpaid
  leave as full days or a single first/second half-day.
- Release `0.6.0` prevents overlapping pending/approved requests with a database
  invariant and requires the assigned active Reporting Manager.
- Paid balance enforcement activates only when an annual entitlement exists;
  unconfigured balances are displayed as not configured rather than guessed.
- Employees see reconciled attendance plus pending/approved leave on a personal
  monthly calendar. Calendar responses deliberately omit the private reason.
- Approved full-day leave becomes the final effective daily attendance state while
  preserving source evidence. Half-day leave reduces the effective requirement to
  270 minutes and keeps evidence for the worked portion.
- Release `0.7.0` adds auditable company holidays, excludes them from new leave
  requests, reconciles them as effective holiday attendance, and displays them in
  the personal calendar.
- Release `0.7.0` adds HR-scoped annual entitlement/adjustment administration and
  company policy administration with active-leave conflict guards.
- Release `0.9.0` adds the studio location directory, effective-dated employee
  location assignment history, exact-location RBAC/ABAC, location holiday selection,
  and location-aware leave, calendar, and attendance reconciliation.
- Team Calendar resolves direct reports, or company workforce for System
  Administration, and has no show selector or show-derived membership.
- Leave reasons remain private unless the viewer has an explicit permission.

See [`LEAVE_CALENDAR_WORKFLOW.md`](LEAVE_CALENDAR_WORKFLOW.md) for the implemented
contracts, APIs, approval scope, reconciliation behavior, and test procedure.

## 11. Administration pages

### HR administration

- Employee directory and employee creation
- Employee profile, status, and reporting-manager maintenance
- Studio locations and effective-dated employee location assignments
- Company and location holidays
- Annual leave entitlements and adjustments
- Regularisation and leave approval oversight
- Scoped reports and CSV exports

### Show administration

- Shows
- Scoped Show Manager role assignments
- Active-show availability for employee timesheets
- No employee-show assignment, task catalog, or timesheet approval queue

### Attendance administration

- Biometric CSV import
- Access-card CSV import
- Import history
- Failed and unmatched rows
- Daily reconciliation
- Missing punches
- Source discrepancies
- Regularisation queue

### Security administration

- Login account provisioning and status control
- Temporary password reset with session revocation
- Seeded system roles and permission sets
- Company, direct-report, show, location, and self-scoped role assignments
- Immutable employee and security change events

Navigation is permission-driven, and direct page URLs and API calls are also
protected.

## 12. Technical architecture

Use a TypeScript MERN monorepo and a modular-monolith API for the MVP.

```text
gnomon/
|-- apps/
|   |-- web/                 # React and TypeScript
|   `-- api/                 # Node.js, Express, and TypeScript
|-- packages/
|   |-- shared/              # Shared types and validation
|   `-- ui/                  # Shared UI components
|-- deploy/
|   |-- helm/                # Kubernetes Helm chart
|   `-- scripts/
|-- docs/
`-- tests/
```

Proposed application stack:

- React, TypeScript, and Vite
- TanStack Query
- React Hook Form
- FullCalendar
- Node.js, Express, and TypeScript
- MongoDB and Mongoose
- Zod validation
- Secure access/refresh token authentication
- Vitest or Jest, Supertest, and Playwright
- Docker and Helm

## 13. Local Kubernetes deployment

The deployment target is the existing single-node kubeadm cluster using
containerd, NGINX Ingress, MetalLB, and the `local-path` storage class.

MVP deployment components:

- Web Deployment and Service
- API Deployment and Service
- MongoDB StatefulSet and persistent volume
- Traefik or NGINX Ingress
- ConfigMaps and Kubernetes Secrets
- Startup, readiness, and liveness probes
- CPU and memory requests/limits
- MongoDB backup CronJob and a documented restore procedure
- Helm chart for repeatable installation and upgrades

A single MongoDB pod is acceptable for a local MVP, but is not highly
available. A later production design should use a replica set or an independently
managed MongoDB service. This server currently requires MongoDB 4.4 because its
CPU does not expose the AVX instructions required by newer MongoDB releases.

## 14. Delivery phases

### Phase 1: Foundation

- Confirm the MVP business-rule and CSV contract baselines.
- Create wireframes and navigation model.
- Scaffold the monorepo and development environment.
- Implement authentication, employee hierarchy, shows, RBAC, and ABAC.
- Add repeatable type-check, test, build, and end-to-end commands.

### Phase 2: Attendance ingestion and website sessions

- Biometric CSV import.
- Access-card CSV import.
- Import validation, idempotency, and review queue.
- Employee start/stop workflow.
- Workday boundary and duration calculation.

### Phase 3: Time entries and reconciliation

- Implemented in the current MVP: every employee may select any active show; there
  are no employee-show or task assignments.
- Implemented in the current MVP: direct-saved, non-overlapping show start/end entries
  with a work comment, 10%-to-100% progress, editing, deletion, and daily totals.
- Implemented in `0.4.0`: persisted daily timecard calculation, evidence
  precedence, source comparison, and employee-facing anomaly detection.
- Timesheet submission and approval are intentionally absent from the current MVP.
- Implemented in `0.11.0`: scoped attendance exception reporting and CSV export for
  manager/HR reconciliation review.

### Phase 4: Regularisation and approval engine

- Implemented in `0.5.0`: employee missed-biometric and website start/stop
  correction requests with one active request per work date, source, and missing event.
- Implemented in `0.5.0`: Reporting Manager followed by HR/Attendance final approval.
- Implemented in `0.5.0`: direct-report, company, department, and location approval
  scope, self-approval prevention, decision history, and daily-timecard finalisation.
- Confirmed in `0.11.0`: versioned fixed approval rules are the MVP baseline;
  employee and security changes add immutable audit events.

### Phase 5: Leave and calendar

- Implemented in `0.6.0`: leave types, optional annual balances, full/half-day
  requests, weekday calculation, overlap prevention, cancellation, and history.
- Implemented in `0.6.0`: direct-report Reporting Manager approval with private
  reasons, self-approval prevention, and immutable decision attribution.
- Implemented in `0.6.0`: personal month calendar and approved-leave attendance
  reconciliation.
- Implemented in `0.7.0`: company holiday administration, holiday-aware leave-day
  calculation, personal calendar markers, and holiday attendance finalisation.
- Implemented in `0.7.0`: HR-scoped paid-leave entitlement and adjustment administration.
- Implemented in `0.9.0`: location directory, effective-dated employee assignment,
  exact-location authorization, location-specific holidays, and date-effective
  calendar/leave/reconciliation applicability.
- Implemented: Reporting Manager direct-report calendars and System Administrator
  company calendars with leave-reason privacy and no show filter.

### Phase 6: Administration and reporting

- Implemented in `0.7.0`: permission-aware administration shell for attendance
  imports, company holidays, and employee leave balances.
- Implemented in `0.9.0`: capability-aware studio location cards, employee-location
  assignment, and company/location holiday selection.
- Implemented in `0.11.0`: scoped employee directory, employee creation and profile/
  manager/status maintenance, with immutable change events.
- Implemented in `0.11.0`: System Administrator account provisioning, password/status
  controls, scoped role grants, self-lockout protection, and security audit events.
- Implemented in `0.11.0`: attendance, leave, regularisation, and timesheet reporting
  with role scope enforcement, summary metrics, responsive tables, and CSV exports.
- Implemented in `0.11.0`: four-workspace information architecture for Employee,
  Manager, HR & Admin, and Reporting.

### Phase 7: Deployment and hardening

- Implemented: Docker images, Docker Compose stack, health checks, and Helm chart.
- Implemented: kubeadm-compatible chart and documented local image import workflow.
- Implemented: focused unit, API/service, and desktop/mobile end-to-end coverage.
- Validated on 2026-08-01: rebuilt and smoke-tested the `0.11.0` local Docker
  Compose stack on desktop and mobile Chromium.
- Post-MVP production hardening: backup/restore drill, external security review,
  production secrets, and high-availability database design.

## 15. Items outside the first MVP

- Payroll integration
- Direct biometric/access-card APIs (the model supports them for a later phase)
- Native mobile application
- GPS and geofencing
- Complex shift rostering
- Overtime payroll calculation
- SSO
- Slack or Microsoft Teams integration
- Advanced analytics
- General-purpose approval policy designer
- Task catalog, task assignment, and employee-show assignment
- Configurable shifts, breaks, workweeks, and mismatch tolerances
- Central audit-log explorer and login-history analytics
- Production high availability and disaster-recovery automation

## 16. MVP policy baselines

- Required attendance is 540 gross minutes; break deduction is not calculated.
- The logical workday runs from 07:00 to 07:00 in Asia/Kolkata.
- Standard expected hours are 09:00 to 18:00, Monday to Friday.
- Source endpoint differences greater than 15 minutes trigger a mismatch anomaly.
- Regularisation requires Reporting Manager approval followed by HR/Attendance approval.
- Leave requires one Reporting Manager decision.
- Every employee can select any active show for a timesheet entry.
- The work description is a mandatory free-text comment; no task entity is used.
- Progress is selected in ten-percent steps from 10% through 100%.
- Show entries are non-overlapping, saved directly, editable, and require no approval.

Production rollout still requires anonymized biometric and access-card samples to
be checked against the documented CSV contract. This is source-system validation,
not an unfinished application workflow.

## 17. MVP success criteria

The MVP is successful when:

- An administrator can import biometric and access-card CSV data safely without
  creating duplicate events.
- An employee can start/stop a work session and record show intervals with a work
  comment and progress percentage.
- The application assigns cross-midnight events to the correct work date.
- It calculates and displays the employee's nine-hour requirement.
- It identifies missing and mismatched attendance evidence.
- Employees can submit leave and regularisation requests.
- Requests reach only the correct scoped approvers.
- Reporting Managers, HR, and administrators see only data allowed by their
  permissions and scope.
- Every sensitive change and approval is auditable.
- A System Administrator can provision login accounts and maintain scoped roles
  without using database scripts.
- Managers and administrators can run scoped operational reports and export CSV.
- The complete system can be built and started locally with Docker Compose and
  returns healthy web and API readiness responses.
