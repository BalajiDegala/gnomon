# Attendance Regularisation Workflow

Release `0.5.0` provides an audited correction workflow for missed biometric
punches and missed website timecard starts or stops. It does not modify imported
attendance events or website sessions.

## Employee request

An employee with `regularisation:create` can submit:

- Work date
- Missing source: `biometric` or `website`
- Missing event: opening, closing, or both
- Corrected start and end instants
- Reason of 10–1,000 characters

The selected 07:00–07:00 workday must already be closed. The interval must stay
inside that logical workday, end after it starts, and be no longer than 24 hours.
An active Reporting Manager is required.

Only one pending or approved request may cover the same employee, work date,
source, and missing event. An employee may cancel a request only before the
manager decides it; rejected and cancelled requests release that duplicate key.

## Approval path

```text
Employee submission
        |
        v
Reporting Manager review --reject--> Rejected
        |
      approve
        v
HR / Attendance review ----reject--> Rejected
        |
      approve
        v
Approved daily-timecard finalisation
```

Step 1 is available only to the employee's Reporting Manager with a valid
`REPORTING_MANAGER` or `SYSTEM_ADMIN` grant in direct-report or company scope.
Step 2 requires `HR`, `ATTENDANCE_ADMIN`, or `SYSTEM_ADMIN` with company scope or
a matching employee department/location scope. Neither step permits self approval.

Approval comments are optional. Rejection always requires a reason. Every decision
stores the step, result, actor user and employee, display name, effective actor
role, comment, and timestamp. A compare-and-update status condition prevents two
approvers from deciding the same step concurrently.

The current path is versioned as `REGULARISATION_V1`. It is the MVP baseline and
will move to administrator-configurable approval policies in a later slice.

## Attendance finalisation

Submission and each decision trigger daily reconciliation. Pending requests mark
the day `pending`; a final rejection marks it `rejected`. Final approval marks the
day `approved` and writes:

- `finalisation.isFinal: true`
- `finalisation.finalSource: regularised`
- The corrected start, end, and minutes
- The final approving user and decision timestamp

The calculated biometric, access-card, website, task summaries, anomalies, and
version remain available. No raw source record is overwritten.

## API surface

| Method | Route                                                   | Permission               |
| ------ | ------------------------------------------------------- | ------------------------ |
| `GET`  | `/api/v1/regularisations/mine`                          | `regularisation:create`  |
| `POST` | `/api/v1/regularisations`                               | `regularisation:create`  |
| `POST` | `/api/v1/regularisations/:requestId/cancel`             | `regularisation:create`  |
| `GET`  | `/api/v1/approvals/regularisations`                     | `regularisation:approve` |
| `POST` | `/api/v1/approvals/regularisations/:requestId/decision` | `regularisation:approve` |

The employee page is permission-filtered under **Regularisation**. The **Approvals**
page returns only requests that pass the API's role and attribute-scope checks;
navigation visibility is not treated as a security control.

## Verification

Contract and service tests cover validation and authorization boundaries. The
Playwright workflow uses three isolated users to submit, approve as Reporting
Manager, approve as HR, and verify the employee's decision history. Its fixture
seeder refuses to run unless `NODE_ENV=test` and the MongoDB database name ends
in `_test`.
