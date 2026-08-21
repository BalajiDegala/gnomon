# Attendance Import Formats

Gnomon accepts biometric and access-card attendance files from the secured
**Administration → Attendance imports** page. It accepts canonical attendance CSVs
and the door controller's **All Transactions** workbook. Imported attendance evidence
is immutable; corrections must be handled by the regularisation workflow.

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

- Existing employees are matched by `Personnel ID`. Missing employee profiles are
  created automatically using the supplied name, card, and department metadata.
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

## CSV columns

| Column            | Required | Description                                       |
| ----------------- | -------- | ------------------------------------------------- |
| `employee_code`   | Yes      | Active DIGITAL DOMAIN INDIA employee code.        |
| `occurred_at`     | Yes      | Event date and time. See timestamp formats below. |
| `event_type`      | Yes      | Source-specific direction of the event.           |
| `source_event_id` | No       | Stable identifier supplied by the source system.  |
| `device_id`       | No       | Biometric terminal or card-reader identifier.     |
| `device_name`     | No       | Human-readable terminal or reader name.           |

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
- Invalid timestamps, invalid event types, and unknown/inactive employee codes
  are rejected at row level and shown in the review result.
- A file containing both accepted and rejected rows receives `partial` status.
- Up to 500 row errors are retained on an import batch to keep MongoDB documents
  bounded.

The in-application **Download template** action generates the correct header and
source-specific example rows.
