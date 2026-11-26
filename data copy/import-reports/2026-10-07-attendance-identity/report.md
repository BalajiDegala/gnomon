# Attendance identity normalization

Applied to the local Gnomon API on 12 October 2026.

Controller codes such as `556` and `9556` now resolve to the scoped master
employee `DDIH556` in Attendance details. This resolution does not require the
card number to remain the same. Ambiguous directory matches stay separate, and
arbitrary numeric prefixes are not stripped.

For Amar Balaji Kamble, the old controller profile `516` and the newer `9516`
representation now report under `DDIH516` with the HR department `Integration`.
The directory lookup applies even when only the old card profile has attendance
in the requested month. The `Department Name` export placeholder is treated as
missing metadata. This is a reporting change; source profiles and stored events
are not merged or rewritten.

## Validation

- 15 tests passed across attendance identity, reporting and employee scope tests.
- API type checking, compilation, formatting and Git whitespace checks passed.
- Every attendance evidence field was compared before and after deployment:
  1,477 August report rows and 4,061 September report rows were unchanged apart
  from employee identity and department metadata.
- Amar's six August rows and sixteen September rows all use one employee ID,
  code `DDIH516`, and department `Integration`.
- Live API responses match the preview exactly.
- Browser checks verify a single group by employee and by department in both months.
- The `556`/`9556` example is covered by regression tests; the supplied live
  August/September data contains no employee code `DDIH556`.

Evidence:

- [Live API verification](verify-summary.json)
- [Browser verification](browser-verification.json)
- [September employee grouping](2026-09-amar-employee.png)
- [September department grouping](2026-09-amar-department.png)
- [August employee grouping](2026-08-amar-employee.png)

## Deployment

The normal Docker build failed during `npm ci` with npm's "Exit handler never
called" error. The successfully compiled API was packaged using the existing
runtime image and dependencies; no dependencies were added or changed.

Updated image: `gnomon-api:attendance-identity-20261012`
(`sha256:bb21d9e90a450ddb44e560b8e46664a778049142136630b2f36a45bf77a7cc8a`).
The local Compose API runs this image under its normal `gnomon-api` tag and is healthy.

Rollback image: `gnomon-api:before-identity-20261012`
(`sha256:97545953f60d8484f6c341fb930226378e27309768143c46c83c49066adcf16b`).
