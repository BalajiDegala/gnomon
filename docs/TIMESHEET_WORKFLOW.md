# Direct Show Timesheet Workflow

Gnomon timesheets record employee time directly against active shows. They are not
approval requests and do not use a task catalog or employee-show assignments.

## Fixed MVP Rules

- Every employee with `timesheet:create` may select any active show.
- No show or task is assigned to an employee.
- The employee describes the task or work performed in a mandatory free-text comment.
- Progress is selected as 10%, 20%, through 100%.
- Start and end are mandatory, must stay inside one 07:00-to-07:00 workday, and may
  not overlap another entry owned by the employee.
- Saving creates the final operational entry immediately. There is no draft,
  submission, approval, rejection, or approver-routing state.
- The employee may edit or delete their own entry.

The progress percentage describes completion of the work in that entry. It is not a
work-progress percentage and does not need to total 100% across the day.

## User Interface

The Timesheets page provides:

- one work-date selector with previous/next-day controls;
- one Show filter;
- sortable Time, Show, Duration, and Progress columns;
- Work comment, Duration, Progress, and Edit/Delete actions;
- daily total duration, entry count, and average progress;
- a create/edit dialog and read-only detail drawer.

There are no workflow-status tabs or submit buttons. Timesheets do not appear on the
Approvals page. Team Calendar does not filter or group people by show.

## Show Administration

Show administration creates, edits, and lists shows. Managers can update a show's code,
name, and lifecycle status. An `active` show is immediately available to every employee in
the timesheet Show selector. `on_hold`, `completed`, and `archived` shows remain historical
records and cannot be selected for a new entry. An existing entry may retain its inactive
show while its time, comment, or progress is corrected.

A Show Manager role may administer shows inside its configured show/company scope.
That role does not receive timesheet approval or employee attendance access.

## API

| Method   | Route                                 | Behavior                      |
| -------- | ------------------------------------- | ----------------------------- |
| `GET`    | `/api/v1/timesheets/options`          | List every active show        |
| `GET`    | `/api/v1/timesheets?workDate=...`     | Read the employee's day       |
| `POST`   | `/api/v1/timesheets/entries`          | Save a direct timesheet entry |
| `PATCH`  | `/api/v1/timesheets/entries/:entryId` | Edit the employee's entry     |
| `DELETE` | `/api/v1/timesheets/entries/:entryId` | Delete the employee's entry   |
| `GET`    | `/api/v1/shows`                       | List manageable shows         |
| `POST`   | `/api/v1/shows`                       | Create a company-scoped show  |
| `PATCH`  | `/api/v1/shows/:showId`               | Edit show identity and status |

All timesheet routes require authentication and `timesheet:create` in self/company
scope. Ownership is checked again for update and delete operations.

## Reconciliation And Reporting

Show time remains supporting attendance evidence. The reconciliation engine may flag
show time outside website sessions or show time exceeding known presence, but show time
never replaces biometric, access-card, or website attendance evidence.

Timesheet reports include Employee, Date, Show, Duration, Progress, and Work comment.
There is no timesheet approval status or pending-approval count.
