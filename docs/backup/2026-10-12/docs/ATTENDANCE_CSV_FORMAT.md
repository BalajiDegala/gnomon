# Attendance Import Formats

Gnomon accepts biometric and access-card attendance files from the secured
**Administration → Attendance imports** page. It accepts canonical attendance CSVs
and the door controller's **All Transactions** workbook. Original punch evidence is
retained for audit. Administrators with company-scoped import access can delete a
batch or replace a source for a work-date range; these actions remove punches from
active attendance without erasing the original evidence.

## File limits

- CSV: UTF-8 with or without a byte-order mark, maximum 5 MB and 20,000 rows.
- Door workbook: XLSX/OOXML content, maximum 10 MB and 250,000 transactions. The
  controller may give this export an `.xls` filename even though its content is XLSX.
- Quoted fields, commas inside quoted fields, and Windows or Unix line endings
  are supported in CSVs.

## Door access workbook

Choose **Door access workbook** for the controller's **All Transactions** export.
The importer locates these columns: `Time`, `Event Point`, `Event Description`,
`Event Level`, `Personnel ID`, `First Name`, `Last Name`, `Card Number`,
`Department Name`, `Reader Name`, and `Verification Mode`.

Attendance endpoints are derived as follows:

- Existing employees are matched by `Personnel ID`. When the employee directory is
  also imported, biometric codes such as `DDIC279`, `DDIH054`, and `DDII061` are
  linked to controller IDs such as `7279`, `9054`, and `5061`; an exact employee
  name match is used when a controller ID has been reassigned. Missing employee
  profiles are created automatically using the supplied name, card, and department metadata.
  Since the controller does not supply email addresses or passwords, imported
  profiles receive a reserved non-deliverable email and no login account.
- The workday is 07:00 through 06:59 the following calendar day in Asia/Kolkata.
- Only successful, normal card verifications at `NORTH-ZONE-ENTRY` and
  `SOUTH-ZONE-ENTRY` are eligible.
- The earliest eligible reader ending in `-In` is the day's access-card entry.
- The latest eligible reader ending in `-Out` is the day's access-card exit.
- Internal `NORTH-ZONE-PASSAGE` and `SOUTH-ZONE-PASSAGE` movement, intermediate
  gate swipes, exit-button/superuser opens, expired or unregistered credentials,
  and controller status events are counted as ignored rather than rejected.

The selected entry and exit retain their source row, event point, reader name, and
raw workbook fields for audit. Affected daily attendance timecards are regenerated
after import. Re-uploading the same workbook is idempotent.

### Employee and department grouping in Attendance details

Attendance details resolves controller-only profiles to the scoped employee
directory across the whole selected month. For a directory code such as `DDIH556`,
controller IDs `556` and `9556` are representations of the same employee, including
when their card numbers differ or one export omits the card number. The existing
`DDIC` and `DDII` controller-family mappings are also supported. An ambiguous
directory mapping is left unresolved.

Resolved rows use the master employee's ID, code, name and department, including
months or dates containing only the older controller representation. Department
selection prefers HR data, then biometric profile data, then a meaningful card
department. The controller placeholder `Department Name` is treated as missing.
Codes outside the documented directory families require a unique matching card
and full name for this reporting fallback. Source profiles and original punch
evidence remain unchanged.

## CSV columns

| Column            | Required | Description                                        |
| ----------------- | -------- | -------------------------------------------------- |
| `employee_code`   | Yes      | Employee code; see automatic creation rules below. |
| `occurred_at`     | Yes      | Event date and time. See timestamp formats below.  |
| `event_type`      | Yes      | Source-specific direction of the event.            |
| `source_event_id` | No       | Stable identifier supplied by the source system.   |
| `device_id`       | No       | Biometric terminal or card-reader identifier.      |
| `device_name`     | No       | Human-readable terminal or reader name.            |
| `employee_name`   | No       | Required to create a missing biometric employee.   |
| `department`      | No       | Department retained on a new biometric profile.    |
| `designation`     | No       | Designation retained on a new biometric profile.   |
| `company`         | No       | Company retained on a new biometric profile.       |

Column names are case-insensitive. Spaces and hyphens are normalized to
underscores, but using the canonical names above is recommended.

## Event types

Biometric files use `in` and `out`. The aliases `punch_in`, `punch_out`,
`check_in`, and `check_out` are also accepted.

Access-card files use `entry` and `exit`. The aliases `in`, `out`, `card_in`,
`card_out`, `access_in`, and `access_out` are also accepted.

## Timestamp formats

Preferred format:

```text
2026-07-27T09:03:00+05:30
```

The following source-oriented formats are also accepted:

```text
2026-07-27 09:03:00
27/07/2026 09:03:00
27-07-2026 09:03
```

Timestamps that do not contain an offset are interpreted as Asia/Kolkata.
Events from midnight through 06:59 belong to the previous logical work date;
07:00 begins the next work date.

## Biometric example

```csv
employee_code,occurred_at,event_type,source_event_id,device_id,device_name
DDI0001,2026-07-27 09:03:00,in,BIO-000001,BIO-01,Main gate
DDI0001,2026-07-27 18:07:00,out,BIO-000002,BIO-01,Main gate
```

### Monthly biometric summary export

The biometric importer also accepts the attendance-system summary layout used by
`data/biometrix.csv`. Its required columns are `Date`, `Employee Code`, `In Time`, and
`Out Time`; additional columns remain attached to the immutable raw evidence. A populated In Time
becomes an `in` event and a populated Out Time becomes an `out` event. Empty Absent and WeeklyOff
rows are ignored. When Out Time is earlier than In Time, it is treated as an overnight exit on the
following calendar date while remaining attached to the report's stated work date.

Missing biometric employees are created automatically when valid punch rows supply
an `Employee Name` (or `employee_name` in canonical CSV). The import first checks
existing employee codes, controller identities, and unique full-name matches. New
profiles retain the employee code, full name, department, designation (including the
export's `Degination` spelling), and company. They appear in People and use a reserved
non-deliverable email; no login, password, role or approval permissions are created.
Importing the HR directory later can enrich the same profile with its real email
and approvers. Existing employee details are preserved by attendance imports.

Missing names, conflicting names for one code, ambiguous existing identities, and
inactive employees require review and remain rejected. Blank Absent/WeeklyOff rows
do not create employees or explicit attendance statuses. Replacement previews use
the same matching rules and do not create profiles until confirmed.

## Access-card example

```csv
employee_code,occurred_at,event_type,source_event_id,device_id,device_name
DDI0001,2026-07-27T08:58:00+05:30,entry,CARD-000001,READER-01,Studio entrance
DDI0001,2026-07-27T18:12:00+05:30,exit,CARD-000002,READER-01,Studio entrance
```

## Duplicate and failure behavior

- The file content is hashed. Uploading the exact file again returns its
  original completed result without processing it twice. Failed or partial
  batches can be retried after employee-directory or source-data corrections.
- Every accepted row receives a stable fingerprint. A row already seen in a
  different file is counted as a duplicate and does not create another event.
- Invalid timestamps, invalid event types, and unresolved/inactive employee codes
  are rejected at row level and shown in the review result.
- A file containing both accepted and rejected rows receives `partial` status.
- Up to 500 row errors are retained on an import batch to keep MongoDB documents
  bounded.

The in-application **Download template** action generates the correct header and
source-specific example rows.

## Delete an import

In **Import history**, select **Delete**, review the affected punches, employees and
workdays, enter a reason, and confirm. Only active punches first created by that
batch are removed. Rows counted as duplicates belong to an earlier batch and are
not removed by deleting the later upload. The deleted batch stays in history.
The original file can be uploaded again afterward.

When a day has no remaining punches, website sessions, timesheets, leave/holiday
finalisation or regularisation activity, its empty daily summary no longer appears
in Attendance details or workforce attendance reports, including their counts and
recorded-month lists. Employee profiles and the deletion audit history remain.

## Replace attendance with corrected data

1. Choose the attendance file type and **Replace attendance for a period**.
2. Select the first and last work dates, inclusive, using the 07:00 India workday.
3. Upload the complete corrected data for that source and period.
4. Select **Preview replacement**, review the counts, enter a reason, and confirm.

Replacement removes **all active punches for the selected source and period, for
all employees**, including punches from other uploads and employees omitted from
the corrected file. It inserts the replacement file's punches and recalculates
both newly populated and now-empty employee workdays. Other attendance sources,
employee profiles, website sessions, leave, timesheets and approvals are retained.
Approved regularisations continue to determine finalised attendance.

Every replacement row must be valid, match an employee (or a provisionable door or
biometric profile), and belong to the selected period. Empty files, invalid rows, unresolved
employees and out-of-period punches are rejected before attendance is removed.
A valid summary containing only ignored Absent/WeeklyOff rows can explicitly clear
the chosen period; its preview shows zero replacement punches. Future periods are
not accepted. A changed preview must be reviewed again before confirmation.

Adding a file in **Add new punches** mode still skips duplicates and does not
overwrite existing punch times. Replacement is the mode for correcting those times.

## Audit and interrupted operations

Removed punches retain their original fields, fingerprint, actor, reason and
removal time. Batch history shows the number removed and the latest reason.
`attendanceimportchanges` records each delete/replacement and its outcome.
Ordinary processing errors restore the old punches and batch metadata and
recalculate affected timecards. Attendance writes are serialized with a database
lock; previews are read-only.

If the API is terminated during a change, or rollback cannot complete because
MongoDB is unavailable, further imports remain paused. Stop all API and import
workers using this database before recovering. For the local Docker deployment:

```bash
sudo -n docker compose stop api
sudo -n docker compose run --rm --no-deps api \
  node apps/api/dist/scripts/recover-attendance-change.js --writers-stopped
sudo -n docker compose up -d api
```

The recovery command restores interrupted changes before releasing the lock.
Do not manually delete the lock while a writer is running.

To run the database integration checks against an isolated test database:

```bash
GNOMON_IMPORT_TEST_MONGODB_URI=mongodb://127.0.0.1:27017/gnomon_import_changes_local_test \
  npm run test --workspace @gnomon/api -- test/attendance-import-change.integration.test.ts
```
