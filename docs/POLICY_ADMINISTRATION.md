# Location, Holiday, and Leave-Balance Administration

Gnomon `0.9.0` provides permission-aware administration for DIGITAL DOMAIN INDIA's
studio locations, employee location history, company/location calendars, and annual
paid-leave balances. It extends the leave and attendance baseline without inventing
statutory entitlements or rewriting historical evidence.

## Access model

| Capability                   | Permission and accepted role                                | Scope enforcement                                                                      |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Studio location creation     | `policy:manage`                                             | Company scope only                                                                     |
| Employee location assignment | `employee:update` held by HR or System Administration       | Company scope may assign/clear; location scope may retain the same exact location only |
| Company/location holidays    | `policy:manage` held by Attendance or System Administration | Company grants may manage all; location grants only matching location identifiers      |
| Employee paid-leave balances | `employee:update` held by HR or System Administration       | Company, matching department, or matching current location                             |
| Attendance CSV import        | `imports:create`                                            | Existing company scope                                                                 |

The React Administration workspace hides sections the user cannot operate. API
middleware verifies the permission, and services independently verify the role and
target attributes. UI hiding is not treated as a security boundary.

## Location persistence and assignment behavior

`locations` stores a unique uppercase code, display name, active/inactive status,
creating/updating users, and timestamps. The Administration workspace displays only
the locations visible through a company or exact-location `policy:manage` or
`employee:update` grant. Each row states whether the current user can manage holiday
policy and/or employee assignments there.

`employee_location_assignments` is an effective-dated audit history. Each record
stores the employee, nullable location, inclusive `effectiveFrom`/`effectiveUntil`
work dates, assigning user, and timestamps. One employee can have only one current
assignment. A change takes effect on the current `Asia/Kolkata` 07:00 work date,
closes the prior range on the preceding date, and updates the employee's current
location lookup. A same-day correction updates that day's history row instead of
creating overlapping history.

Company-scoped HR/System Administration can assign, move, or clear any employee.
Exact-location HR scope can inspect an employee already in that location and keep the
employee there; it cannot claim an unassigned employee, move an employee across
locations, or clear the assignment. Department-only grants do not imply location
directory or assignment access.

Changing an employee location is blocked if active leave would gain or lose a future
location holiday. If today's daily timecard already exists, it is recalculated after
the change. Historical calendar, leave, holiday, and reconciliation queries resolve
the effective assignment for the requested date; the legacy employee location is
used only when no assignment history exists.

## Holiday persistence and behavior

`holidays` stores the date, name, company/location scope, optional location identifier,
active/archive status, creating/updating users, and timestamps. A unique index on date,
scope type, and location prevents duplicate policy rows. Saving an archived date
reactivates the same audited record; archiving does not delete it. The `0.9.0` UI lets
company policy administrators choose company-wide or an authorized studio location;
exact-location administrators can create policy only for their granted locations.

An active company holiday and any active location holiday cannot share the same date.
This avoids ambiguous calendar and attendance states. Location-scoped leave conflicts
are evaluated only for employees assigned to that location on the holiday date.

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

GET  /api/v1/administration/locations
POST /api/v1/administration/locations

GET /api/v1/administration/employee-locations?employeeCode=CODE
PUT /api/v1/administration/employee-locations/:employeeCode

GET  /api/v1/administration/leave-balances?employeeCode=CODE&year=YYYY
PUT  /api/v1/administration/leave-balances/:employeeCode
```

Shared Zod contracts validate dates, years, names, scope/location agreement, leave
types, numeric limits, and note length.

## Verification

Contract and service tests cover location normalization, assignment authorization,
holiday validation, company/location policy scope, HR employee scope, holiday-aware
leave calculation, holiday reconciliation, and protected routes. The isolated
Playwright workflow proves location creation and employee assignment, location holiday
entry, employee balance configuration, mobile responsiveness, assigned-employee
calendar visibility, unassigned-employee exclusion, and persisted MongoDB state.

The E2E seed refuses any database that is not both `NODE_ENV=test` and suffixed
`_test`; the verification database is dropped after direct assertions.

## Follow-up scope

- Bulk leave-balance CSV import and export
- Leave-type catalogue and carry-forward/expiry rules
- Holiday calendar cloning between years
- Location archive/reactivation and future-effective transfer scheduling
- Dedicated audit-log reporting and HR override workflow
