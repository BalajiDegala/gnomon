# Daily Reconciliation Policy

This document records the `0.4.0` employee attendance calculation. It is a
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
version counter records every recalculation. Recalculation updates only the
source summary and calculated result; future regularisation and finalisation
fields are preserved.

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

## Duration caveat

`breakMinutes` is currently zero and `payableMinutes` equals gross presence.
This avoids inventing an unpaid-break rule while the company confirms whether
the required nine hours include lunch and other breaks. The result must not be
used as a payroll finalisation until that decision and the HR finalisation flow
are implemented.

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

Regularisation requests will reference these anomalies without modifying raw
attendance events. Approved corrections can then update finalisation while
preserving the calculated version and complete audit history.
