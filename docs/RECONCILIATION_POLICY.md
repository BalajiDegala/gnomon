# Daily Reconciliation Policy

This document records the `0.5.0` employee attendance calculation and
regularisation finalisation. It is a
provisional MVP policy: immutable evidence is preserved, calculations can be
regenerated, and unresolved business settings remain explicit rather than being
treated as final payroll rules.

## Workday and persistence

- Timezone: `Asia/Kolkata`
- Work-date window: 07:00 on the work date through 07:00 the following day
- Expected shift: 09:00–18:00
- Required duration: 540 minutes
- Working week: Monday–Friday
- Unique daily record: employee identifier plus work date

The API reads current evidence and upserts one `daily_timecards` document. A
version counter records every recalculation. Each pass refreshes the immutable-source
summary, calculated result, regularisation status, and a coherent calculated or
approved finalisation snapshot.

## Evidence precedence

The calculation chooses the first available source in this order:

1. Biometric punches
2. Access-card events
3. Website sessions
4. No primary source

Task entries support comparison but never become the official attendance
source. If biometric evidence exists but is incomplete, a lower-priority source
does not silently replace it. Access-card or website-led results are marked
provisional.

For a complete biometric or access-card source, gross presence is the interval
between its first opening event and last closing event. Website presence is the
sum of its sessions, including elapsed time for a currently running session.
Rejected task entries are excluded from task totals.

## Open and closed workdays

Missing closing events and insufficient hours are not raised prematurely while
the 07:00–07:00 window remains open. Once it closes on a Monday–Friday work
date, the calculation checks all expected source openings/closings, website
start/stop activity, the nine-hour requirement, and unsubmitted task drafts.

A closed working day without biometric, access-card, or website evidence is
`absent`. A complete biometric day of at least 540 minutes is `present`.
Incomplete or lower-priority evidence remains `partial`. Saturdays and Sundays
are `weekend`; leave and holiday states will be connected in the leave/calendar
slice.

## Review anomalies

The current calculation can emit:

- Missing biometric in or out
- Missing access-card entry or exit
- Missing website start or stop
- Invalid opening/closing event order
- Source start/end mismatch
- Insufficient hours
- Task time outside every website session
- Task time exceeding known presence
- Draft task time remaining after the workday closes

Source endpoints are considered mismatched when their starts or ends differ by
more than 15 minutes. This value is provisional and isolated in the service as
`SOURCE_MISMATCH_TOLERANCE_MINUTES`; it will become attendance-policy
configuration after the business threshold is confirmed.

## Approved regularisation

An employee may request a corrected biometric or website interval only after the
selected 07:00–07:00 workday has closed. A Reporting Manager inside the employee's
direct-report scope must approve first; HR, Attendance Administration, or a System
Administrator inside company, department, or location scope gives final approval.
Self approval is forbidden at both steps.

While a request is pending, the calculated evidence remains visible and the daily
record is marked `pending`. Final approval sets `finalisation.isFinal` to true,
uses `regularised` as the final source, and records the requested start, end,
minutes, final approver, and decision time. Raw biometric, access-card, website,
and task evidence is never rewritten. See
[`REGULARISATION_WORKFLOW.md`](REGULARISATION_WORKFLOW.md).

## Duration caveat

`breakMinutes` is currently zero and `payableMinutes` equals gross presence.
This avoids inventing an unpaid-break rule while the company confirms whether
the required nine hours include lunch and other breaks. Attendance regularisation
can now be final, but the result must not be used as payroll finalisation until
that break-policy decision is confirmed.

## Employee API and UI

`GET /api/v1/reconciliation?workDate=YYYY-MM-DD` requires
`attendance:self:read` and always pins the query to the authenticated employee.
Future work dates are rejected. The `/api/v1/timecard/today` response also
includes the live reconciliation so start/stop changes update the dashboard
immediately.

The responsive dashboard compares biometric, access-card, website, and task
minutes; displays the primary source and provisional state; shows progress
against 540 minutes; and translates anomaly codes into review messages.

## Next slice

The reconciliation service will next consume approved leave and holiday state.
Policy administration will later make the 15-minute source tolerance, shift,
workday boundary, required duration, and approval path configurable.
