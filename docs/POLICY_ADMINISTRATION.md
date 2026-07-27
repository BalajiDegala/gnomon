# Holiday and Leave-Balance Administration

Gnomon `0.7.0` adds permission-aware administration for DIGITAL DOMAIN INDIA's
company calendar and employee annual paid-leave balances. It extends the leave and
attendance baseline without inventing statutory entitlements or rewriting historical
evidence.

## Access model

| Capability                   | Permission and accepted role                                | Scope enforcement                                                                 |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Company/location holidays    | `policy:manage` held by Attendance or System Administration | Company grants may manage all; location grants only matching location identifiers |
| Employee paid-leave balances | `employee:update` held by HR or System Administration       | Company, matching department, or matching location                                |
| Attendance CSV import        | `imports:create`                                            | Existing company scope                                                            |

The React Administration workspace hides sections the user cannot operate. API
middleware verifies the permission, and services independently verify the role and
target attributes. UI hiding is not treated as a security boundary.

## Holiday persistence and behavior

`holidays` stores the date, name, company/location scope, optional location identifier,
active/archive status, creating/updating users, and timestamps. A unique index on date,
scope type, and location prevents duplicate policy rows. Saving an archived date
reactivates the same audited record; archiving does not delete it.

The `0.7.0` UI creates company-wide holidays. The persistence model, employee lookup,
calendar query, and authorization checks already support location-scoped records; a
location directory/selector is follow-up work.

Policy changes preserve leave accounting:

- Adding/reactivating a holiday is blocked when an active pending/approved leave
  already reserves that date.
- Archiving is blocked when an active leave range spans the date.
- Existing current/past daily timecards for a changed date are recalculated.
- Future holidays affect leave calculation and personal calendars immediately but do
  not manufacture future daily attendance records.

Applicable holidays are excluded from new leave working dates. On current/past dates,
effective attendance becomes `holiday`, anomalies are cleared, and the derived final
source is `holiday`; all raw source summaries remain unchanged.

## Leave-balance persistence and behavior

Annual records exist only for casual, sick, and earned leave. Each stores:

- employee, leave type, and year (unique together);
- non-negative entitlement days;
- signed adjustment days;
- an optional administrative note and updating user;
- timestamps.

The Administration page looks up an active employee by code and shows entitlement,
adjustment, pending, approved, and available values. An update is rejected if the new
entitlement plus adjustment would be lower than pending plus approved usage. Unpaid
leave remains request-counted without an entitlement ceiling. When no paid record
exists, the employee UI continues to say **Not set** rather than assuming a balance.

## API surface

```text
GET  /api/v1/administration/holidays?year=YYYY
PUT  /api/v1/administration/holidays
POST /api/v1/administration/holidays/:holidayId/archive

GET  /api/v1/administration/leave-balances?employeeCode=CODE&year=YYYY
PUT  /api/v1/administration/leave-balances/:employeeCode
```

Shared Zod contracts validate dates, years, names, scope/location agreement, leave
types, numeric limits, and note length.

## Verification

Contract and service tests cover holiday validation, company/location policy scope,
HR employee scope, holiday-aware leave calculation, holiday reconciliation, and
protected routes. The isolated Playwright workflow proves HR/Attendance policy entry,
employee balance configuration, mobile responsiveness, personal calendar visibility,
and persisted MongoDB state.

The E2E seed refuses any database that is not both `NODE_ENV=test` and suffixed
`_test`; the verification database is dropped after direct assertions.

## Follow-up scope

- Department/location directory and holiday location selector
- Bulk leave-balance CSV import and export
- Leave-type catalogue and carry-forward/expiry rules
- Holiday calendar cloning between years
- Dedicated audit-log reporting and HR override workflow
