# Leave and Personal Calendar Workflow

This document describes the Gnomon `0.9.0` leave-management and personal-calendar
MVP for DIGITAL DOMAIN INDIA. It is the implemented baseline, not a final payroll
or statutory leave policy.

## Employee workflow

1. Open **Leave** and select casual, sick, earned, or unpaid leave.
2. Select a start/end date and either full day or, for a single date, first/second
   half.
3. Enter a private reason and submit to the assigned Reporting Manager.
4. Track the request as manager review, approved, rejected, or cancelled.
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
- Holidays: applicable active company/location holidays are excluded

Paid balances are stored separately for casual, sick, and earned leave by employee
and year. Each record has entitlement days, signed adjustment days, and an optional
note. Pending requests reserve balance and approved requests consume it. When no
record exists, the UI says **Not set** and approval remains available; Gnomon does
not invent a default entitlement. Unpaid leave is tracked by request totals without
an entitlement ceiling. Release `0.7.0` lets scoped HR administrators configure
entitlement, signed adjustment, and a note by employee/year.

Company and studio-location holidays are managed separately by Attendance/System
Administration. Location applicability is resolved from the employee's
effective-dated assignment on each holiday date. New leave requests exclude only
applicable holiday dates. Adding/archiving a holiday or changing an employee's
location is blocked when it would make an active leave reservation/range gain or lose
a holiday, so stored days and balances never change silently.

## Persistence invariants

`leave_requests` stores:

- employee and snapshotted assigned manager identifiers;
- type, date range, day portion, calculated working dates/days, and private reason;
- status and `LEAVE_V1` policy version;
- manager decision, actor identifiers/role, comment, and timestamp;
- reserved dates and an active-reservation flag.

A partial unique multikey index on employee plus reserved date prevents concurrent
pending/approved requests for the same employee/date. The service also performs an
early overlap check to return a readable conflict. Updates use status conditions so
two approvers cannot decide the same request successfully.

## Authorization and privacy

| Operation                    | Permission             | Attribute scope                                                      |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------- |
| List/create/cancel own leave | `leave:create`         | Authenticated employee only                                          |
| List/decide leave approvals  | `leave:approve`        | Assigned Reporting Manager and permitted direct-report/company scope |
| Read personal calendar       | `attendance:self:read` | Authenticated employee only                                          |

Self approval is always rejected. The approval queue returns private reasons only
after the API confirms the actual reporting relationship and role grant. Personal
calendar responses contain type, portion, status, and duration but deliberately omit
the reason. Hiding navigation in React is convenience only; every API route enforces
its permission independently.

The leave policy uses one Reporting Manager decision. Release `0.7.0` adds HR balance
configuration; HR leave-decision oversight and override remain a later slice.
Regularisation continues to use its separate two-step Manager then HR/Attendance
workflow.

## Attendance interaction

- Approved full-day leave sets the effective daily status to `leave`, removes review
  anomalies for that date, and finalises the daily timecard as `approved_leave`.
- Approved half-day leave reduces the effective attendance requirement from 540 to
  270 minutes and preserves evidence/anomalies for the worked half.
- Biometric, access-card, website-session, and task-time summaries are never changed.
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

GET  /api/v1/administration/locations
POST /api/v1/administration/locations

GET /api/v1/administration/employee-locations?employeeCode=CODE
PUT /api/v1/administration/employee-locations/:employeeCode

GET  /api/v1/administration/leave-balances?employeeCode=CODE&year=YYYY
PUT  /api/v1/administration/leave-balances/:employeeCode
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
- Policy-configurable half-day duration and approval steps
