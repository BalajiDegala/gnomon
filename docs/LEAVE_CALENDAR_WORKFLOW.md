# Leave and Personal Calendar Workflow

This document describes the Gnomon `0.11.0` leave-management and personal-calendar
MVP for DIGITAL DOMAIN INDIA. It is the implemented baseline, not a final payroll
or statutory leave policy.

## Employee workflow

1. Open **Leave** and select casual, sick, earned, or unpaid leave.
2. Select a start/end date and either full day or, for a single date, first/second
   half.
3. Enter a private reason and submit to the department's assigned first approver.
4. Track the request through one or two configured approval stages, or until it is
   approved, rejected, or cancelled.
5. Open **Calendar** to see reconciled attendance and pending/approved leave for a
   selected month.

Employees may cancel only pending requests. Rejected and cancelled dates become
available for another request; pending and approved dates remain reserved.

## Working-day and balance baseline

- Timezone: `Asia/Kolkata`
- Workweek: Monday–Friday
- Maximum request range: 60 calendar days
- Full-day duration: one day per weekday in the range
- Half-day duration: 0.5 day and exactly one weekday
- Cross-year ranges: rejected so one request maps to one annual balance period
- Holidays: active company holidays are excluded for every employee

Paid balances are stored separately for casual, sick, and earned leave by employee
and year. Each record has entitlement days, signed adjustment days, and an optional
note. Pending requests reserve balance and approved requests consume it. When no
record exists, the UI says **Not set** and approval remains available; Gnomon does
not invent a default entitlement. Unpaid leave is tracked by request totals without
an entitlement ceiling. Release `0.7.0` lets scoped HR administrators configure
entitlement, signed adjustment, and a note by employee/year.

Attendance/System Administration manages one company holiday calendar because the
current MVP has one branch and all employees share the same dates. New leave requests
exclude those dates automatically. Adding or archiving a company holiday is blocked
when an active leave reservation/range would gain or lose that date, so stored days
and balances never change silently. Legacy location records are retained only for
backward data compatibility and are not exposed by the current workflow.

## Persistence invariants

`leave_requests` stores:

- employee and snapshotted stage-1/stage-2 approver identifiers;
- type, date range, day portion, calculated working dates/days, and private reason;
- status and `LEAVE_V1` policy version;
- ordered decisions, actor identifiers/role, comments, and timestamps;
- reserved dates and an active-reservation flag.

A partial unique multikey index on employee plus reserved date prevents concurrent
pending/approved requests for the same employee/date. The service also performs an
early overlap check to return a readable conflict. Updates use status conditions so
two approvers cannot decide the same request successfully.

## Authorization and privacy

| Operation                    | Permission             | Attribute scope                                         |
| ---------------------------- | ---------------------- | ------------------------------------------------------- |
| List/create/cancel own leave | `leave:create`         | Authenticated employee only                             |
| List/decide leave approvals  | `leave:approve`        | Assigned stage approver or company System Administrator |
| Read personal calendar       | `attendance:self:read` | Authenticated employee only                             |

Self approval is always rejected. A second-stage pool is any-of: one decision from an
assigned pool member completes that stage. The approval queue returns private reasons only
after the API confirms the snapshotted assignment and role grant. Personal
calendar responses contain type, portion, status, and duration but deliberately omit
the reason. Hiding navigation in React is convenience only; every API route enforces
its permission independently.

Leave approval uses the department route configured in Site preferences. New requests
snapshot one or two stages, including every eligible stage-2 pool member, so later
route changes do not rewrite in-flight approvals. Company System Administrators retain
the audited override path. Regularisation continues to use its separate two-step
Manager then HR/Attendance workflow.

Submitting a request creates an in-app notification for stage 1. A stage-1 approval
moves the request to `pending_hr` and notifies every member of the snapshotted stage-2
pool; one approval resolves that pool and marks the other pool notifications read. A
final approval or any rejection notifies the employee. Notification delivery is tied
to the employee identity, but an approver still needs an active account and a role with
`leave:approve` to open and decide the request. Site preferences identifies route
members whose access has not yet been provisioned.

## Attendance interaction

- Approved full-day leave sets the effective daily status to `leave`, removes review
  anomalies for that date, and finalises the daily timecard as `approved_leave`.
- Approved half-day leave reduces the effective attendance requirement from 540 to
  270 minutes and preserves evidence/anomalies for the worked half.
- Biometric, access-card, website-session, and show-time summaries are never changed.
- Approved regularisation takes precedence over leave when both exist.
- An applicable holiday sets effective attendance to `holiday`, clears attendance
  anomalies, and finalises the derived daily record as `holiday` without changing
  source summaries.
- Future approvals are shown in the calendar immediately; daily records are created
  only for current/past dates to avoid manufacturing future attendance.

## API surface

```text
GET  /api/v1/leaves/mine?year=YYYY
POST /api/v1/leaves
POST /api/v1/leaves/:requestId/cancel

GET  /api/v1/approvals/leaves
POST /api/v1/approvals/leaves/:requestId/decision

GET  /api/v1/calendar?month=YYYY-MM

GET  /api/v1/administration/holidays?year=YYYY
PUT  /api/v1/administration/holidays
POST /api/v1/administration/holidays/:holidayId/archive

GET  /api/v1/administration/leave-balances?employeeCode=CODE&year=YYYY
PUT  /api/v1/administration/leave-balances/:employeeCode

GET  /api/v1/administration/approval-policies
PUT  /api/v1/administration/approval-policies/:policyId
POST /api/v1/imports/approval-routes/csv
```

Creation and decision bodies are validated by shared Zod contracts. Rejection needs
a comment of at least three characters; approval comments are optional.

## Verification

Unit/contract tests cover date rules, half days, future approval eligibility,
manager scope, self approval, privacy-safe DTOs, and full/half-day reconciliation.
The browser workflow uses disposable employee, manager, and HR accounts in a database
whose name must end in `_test`:

```bash
npm run seed:e2e-workflows --workspace @gnomon/api
npm run e2e --workspace @gnomon/web
```

Never point the fixture command at the production `gnomon` database. The seed script
checks `NODE_ENV=test` and the `_test` suffix before writing.

## Follow-up scope

- Leave-type catalogue administration
- HR oversight/override with audit reporting
- Policy-configurable half-day duration
