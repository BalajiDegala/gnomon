# September biometric import and comparison

Imported `data/11th_sep_to_25th_sep.csv` into the running Gnomon instance at
http://localhost:8081 on 28 September 2026 using the authenticated attendance import API.
Batch: `6aba6f7e9c194dbdb9a46018`. Status: **completed**.

## Results

| Check | Result |
| --- | ---: |
| Period | 11–25 September 2026 |
| CSV rows | 3,747 |
| Employee codes in file | 251 |
| Employees with punches | 241 |
| Existing profiles matched | 238 |
| New profiles created | 3 |
| Imported punches | 4,024 |
| Daily attendance records reconciled | 2,149 |
| Complete in/out days | 1,875 |
| Days missing an out-punch | 274 |
| Blank rows ignored | 1,598 |
| Rejected punches | 0 |
| Duplicate punches | 0 |
| Raw event mismatches against parsed CSV | 0 |
| Daily endpoint, event count, or duration mismatches | 0 |

A CSV row can produce two punches. Blank rows do not create attendance evidence or
explicit absence/weekly-off statuses under the existing importer rules.

## Comparison with the previous biometric file

The previous `biometrix.csv` covers **1–30 June 2026**. It has 7,235 rows and 242
employee codes. All **9,196** previous biometric punches are still present. The files
share **219 employee codes** and have **no overlapping dates**. The September file
contains 32 codes absent from the June file, most already known to Gnomon's directory
or door identities. Twenty-three June codes do not appear in the September file;
this does not remove or deactivate employees.

All **17,908 existing attendance event documents**, including retained removed
evidence, and all **277 existing employee profiles** are unchanged. All **4,626 June
attendance report rows** are unchanged. The shared employee mappings are consistent
with the previous import.

All 241 source-code mappings are listed in [employee-mapping.csv](employee-mapping.csv).
Eight source codes resolve to existing controller-code profiles. For example,
`DDHK051` (Ramesh Mahapatra) appears under the existing Gnomon code `11107`.

There are **22 source-name differences** between the June and September exports,
including truncated names, reordered names, and `DDII061` being labelled `I061` in
the new file. Existing employee identities and directory names were retained.
See [name-differences.csv](name-differences.csv). These comparisons establish code
and stored-record consistency; they do not independently establish a person's identity.

## Items to review

- **H727**: the CSV supplies both code and name as `H727`, with 16 punches across
  8 days. The importer created a separate profile preserving that source identity.
  Its relationship to an existing employee, including `DDIH727`, is unconfirmed.
- **274 missing out-punch days**: 196 are on 25 September. The missing times are
  absent in the source CSV and remain missing in Gnomon. See
  [missing-out-punches.csv](missing-out-punches.csv).
- **Two source status inconsistencies**: `DDIC397` and `DDIC398` on 15 September
  are labelled `Absent` despite having both in and out times. The importer retains
  those times and raw source statuses; Gnomon calculates attendance from the punches.

New profiles: `DDIC397` (Sourabh Vilas Khaire), `DDIC398` (Karishma Suhas Mirashi),
and `H727`. These profiles have no new login accounts or permissions.

## Verification evidence

- [Import result](import-result.json)
- [Detailed verification](verification.json)
- [Pre-import comparison](preflight.json)
- [September attendance report](after-september.json)
- [Employee mapping](employee-mapping.csv)
- [Browser verification](browser-verification.json)
- [Import history screenshot](import-history.png)
- [September attendance screenshot](september-attendance.png)

Browser checks passed for the completed import history, September punch times,
June attendance visibility, and all three new profiles. No browser errors occurred.

Source CSV SHA-256: `f16d355b2ab720c28e87f76245e6c4b568ee9d898157dbf27dbb18e5365ff3be`.

No application source changes were required. Reports and baseline snapshots remain
in the Git-ignored `data/import-reports/2026-09-28-september/` directory.
