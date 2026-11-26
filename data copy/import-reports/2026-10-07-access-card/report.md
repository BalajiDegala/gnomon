# Attendance source import verification

Completed on 7 October 2026 against the local Gnomon application at
http://localhost:8081 using the authenticated attendance import API.

| Supplied file | Outcome | Active punches | Recorded dates |
| --- | --- | ---: | --- |
| `11th_sep_to_25th_sep.csv` | Existing completed import confirmed; replay skipped duplicates | 4,024 | 11–25 September 2026 |
| `12th to 22nd sep 2026.xls` | Imported successfully | 9,591 | 21 August–22 September 2026 |

The workbook contains dates earlier than its filename suggests. All eligible
entry and exit records were imported using their actual timestamps and the
configured 07:00 India workday boundary. It contains no card evidence for
23–25 September.

The earlier `11.xls` card import had been deleted on 24 September, leaving zero
active card punches before this import.

## Import results

- Batch ID: `6ac5fe949c194dbdb9a46021`.
- 100,000 workbook transactions processed; 9,591 daily entry/exit records selected.
- 90,409 other/intermediate transactions ignored under the existing import rules.
- Zero rejected or duplicate records.
- 4,847 employee workdays recalculated.
- 253 existing employee profiles matched; 247 attendance profiles created under
  the existing controller identity rules. No login accounts are created by this importer.
- 24 source-name differences are recorded in `preflight.json`; source codes and
  the importer's existing identity mapping were used without manually changing names.

## Verification

Every imported event was compared with the freshly parsed workbook for employee
mapping, timestamp, direction, work date and raw source payload. All 4,847 daily
card summaries were checked through the attendance report API for entry, exit,
duration and event count. All checks passed.

All 21,932 earlier event documents and all 4,626 June attendance report rows were
verified unchanged. September has 1,458 API attendance rows containing both
biometric and card evidence. The page additionally applies its existing personnel
row merge, so displayed totals can differ from raw API row totals.

Browser checks passed for both sources on one employee/date, the access-card
source filter, August card records, and completed import history. No browser
errors occurred. For `DDIC153` on 22 September, the displayed biometric times are
09:18:16 / 18:20:13 and card times are 09:18:33 / 18:19:49 (Asia/Kolkata).

Evidence:

- [Import response](import-result.json)
- [Full verification](verification.json)
- [Browser verification](browser-verification.json)
- [Both sources on the attendance page](attendance-both-sources.png)
- [Access-card filter](attendance-card-filter.png)
- [Completed import history](import-history.png)

Workbook SHA-256: `590684fba663e2c1a468b84754fe7a6757badf2d4f4dc572ff588940084be22b`.

No application source changes or deployment were needed. Reports and snapshots
are retained in this Git-ignored directory.
