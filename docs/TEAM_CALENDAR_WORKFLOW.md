# Team Availability Calendar

Team Calendar is a privacy-safe monthly availability view based on reporting hierarchy,
leave, holidays, and reconciled attendance. It is not connected to shows or timesheets.

## Scope

`GET /api/v1/calendar/managed` requires `attendance:team:read`.

- A `direct_reports` grant returns active employees whose current
  `reportingManagerId` is the viewer. Non-empty scope identifiers may narrow that set.
- A company grant returns the active company workforce, excluding the viewer.
- Show grants and employee-show membership are not used.

The UI resolves this scope automatically. It provides a month selector but no show or
audience filter.

## Privacy

The response includes employee code, display name, availability, attendance status,
leave approval state/day part, and applicable holiday name. It excludes leave reasons,
approval comments, timesheet comments, and raw attendance events.

## Availability States

| State         | Meaning                                       |
| ------------- | --------------------------------------------- |
| `available`   | Working capacity or reconciled presence       |
| `partial`     | Approved half-day leave or partial attendance |
| `unavailable` | Approved full-day leave or explicit absence   |
| `pending`     | Pending leave or attendance regularisation    |
| `no_record`   | A past working day has no reconciled evidence |
| `non_working` | Weekend or company holiday                    |

Current and future working days without leave represent planning capacity. Past missing
evidence remains `no_record` rather than being silently treated as absence.

## API

```text
GET /api/v1/calendar/managed?month=YYYY-MM
```

The page renders the same restricted response as a desktop month matrix and responsive
mobile employee cards.
