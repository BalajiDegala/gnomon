# Attendance CSV Format

Gnomon accepts biometric and access-card attendance files from the secured
**Administration → Attendance imports** page. Imported source rows are immutable;
corrections must be handled by the regularisation workflow.

## File limits

- CSV encoded as UTF-8, with or without a byte-order mark.
- Maximum file size: 5 MB.
- Maximum attendance rows: 20,000.
- Quoted fields, commas inside quoted fields, and Windows or Unix line endings
  are supported.

## Columns

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

## Access-card example

```csv
employee_code,occurred_at,event_type,source_event_id,device_id,device_name
DDI0001,2026-07-27T08:58:00+05:30,entry,CARD-000001,READER-01,Studio entrance
DDI0001,2026-07-27T18:12:00+05:30,exit,CARD-000002,READER-01,Studio entrance
```

## Duplicate and failure behavior

- The file content is hashed. Uploading the exact file again returns its
  original result without processing it twice.
- Every accepted row receives a stable fingerprint. A row already seen in a
  different file is counted as a duplicate and does not create another event.
- Invalid timestamps, invalid event types, and unknown/inactive employee codes
  are rejected at row level and shown in the review result.
- A file containing both accepted and rejected rows receives `partial` status.
- Up to 500 row errors are retained on an import batch to keep MongoDB documents
  bounded.

The in-application **Download template** action generates the correct header and
source-specific example rows.
