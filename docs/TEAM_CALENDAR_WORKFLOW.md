# Team and Show Availability Calendars

Gnomon `0.10.0` adds a privacy-safe monthly availability view for Reporting Managers
and Show Managers. It builds on the personal calendar, employee hierarchy, show
assignments, leave workflow, location holidays, and reconciled daily attendance without
turning UI visibility into an authorization boundary.

## Audiences and scope

`GET /api/v1/calendar/managed` requires `attendance:team:read`. The authenticated
grant determines every available audience:

- A `direct_reports` grant returns only active employees whose current
  `reportingManagerId` is the viewer. Non-empty scope identifiers further restrict that
  set; they never add employees outside the reporting relationship.
- A `show` grant returns only its exact authorized shows and employees with assignments
  overlapping the selected month.
- A company grant may select any non-archived show. This supports System Administration
  without broadening Reporting Manager or Show Manager access.

An arbitrary show identifier is rejected unless it appears in the viewer's resolved
audiences. For a show calendar, each day is checked against the assignment's effective
range. Dates outside that range are returned as `not_assigned` with no attendance,
leave, or holiday detail.

## Privacy contract

The response includes employee code, display name, availability, attendance status,
leave approval state/day part, and applicable holiday name. It deliberately excludes:

- leave reasons;
- approval comments;
- task descriptions;
- raw biometric, access-card, or website events;
- attendance details outside a show assignment window.

The API performs this redaction before serialization. Responsive desktop and mobile
layouts consume the same restricted DTO.

## Availability states

| State          | Meaning                                                               |
| -------------- | --------------------------------------------------------------------- |
| `available`    | Current/future working capacity or reconciled presence                |
| `partial`      | Approved half-day leave or partial reconciled attendance              |
| `unavailable`  | Approved full-day leave or explicit absence                           |
| `pending`      | Pending leave or pending attendance regularisation                    |
| `no_record`    | A past working day has no reconciled evidence                         |
| `non_working`  | Weekend, company holiday, or applicable location holiday              |
| `not_assigned` | The artist was outside the selected show's assignment range that date |

Current and future working days without leave are planning capacity, not a guarantee
that the employee has started work. Past missing evidence remains `no_record` rather
than being silently treated as absent.

## API

```text
GET /api/v1/calendar/managed?month=YYYY-MM
GET /api/v1/calendar/managed?month=YYYY-MM&audienceType=direct_reports
GET /api/v1/calendar/managed?month=YYYY-MM&audienceType=show&showId=OBJECT_ID
```

The response contains all authorized audience options, the selected audience, and a
month row for each active member. The UI exposes these options in the **Team calendar**
management page and provides desktop matrix and mobile card layouts.

## Verification

Shared contract tests enforce query and privacy behavior. API unit tests cover
availability precedence, including leave, weekends, holidays, missing evidence, and
explicit absence. The isolated Playwright workflow verifies Reporting Manager access,
approved-leave visibility, private-reason omission, and desktop/mobile rendering.
