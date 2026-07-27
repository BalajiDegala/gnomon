# Show and Timesheet Workflow

This document records the `0.3.0` workflow for configuring shows and recording
employee task time. The UI calls task-level time records **Timesheets**; the API
and database call each interval a **time entry**.

## Manager setup

The **Shows & tasks** page is visible to users with `show:manage` permission.

1. A company-scoped manager creates a show with a unique code and name.
2. A company-scoped or exact show-scoped manager creates active tasks inside a
   show.
3. The manager assigns an active employee using the employee code.
4. The assigned employee immediately sees that active show and its active tasks
   in the Timesheets page.

Creating a new show requires company scope. Reading or changing an existing
show requires either company scope or a `show` scope grant containing that exact
show identifier. This prevents a Show Manager from administering another show.

## Employee entry workflow

An employee with `timesheet:create` permission can open **Timesheets**, choose a
work date, and add an interval containing:

- Assigned show and active task
- Start and end timestamp
- Task details, from 3 to 1,000 characters
- Billable or non-billable flag

New entries are drafts. The page shows the daily duration, progress toward the
nine-hour target, and entry counts. An employee can delete their own draft but
cannot delete an entry after submission. **Submit work date** changes all drafts
on that work date to `submitted`.

The submitted state is persisted for the upcoming approval workflow. Manager
approval/rejection actions and approval history are intentionally deferred to
the approval-engine slice.

## Time and workday rules

- The company timezone is `Asia/Kolkata`.
- A work date starts at 07:00 and ends at 07:00 the following calendar day.
- An interval must remain inside one such workday.
- Cross-midnight work is supported. For example, Monday 20:00 to Tuesday 05:00
  belongs to Monday.
- The end must be after the start, cannot be more than five minutes in the
  future, and the interval cannot exceed 24 hours.
- An employee cannot create overlapping entries. Rejected entries do not block
  a replacement interval.
- Duration is calculated by the server in whole minutes.

When an interval fits inside one of the employee's website start/stop sessions,
the API stores that work-session identifier on the entry. This provides a link
for later comparison without changing the original website session.

## API surface

All routes require authentication.

| Method   | Route                                    | Purpose                         |
| -------- | ---------------------------------------- | ------------------------------- |
| `GET`    | `/api/v1/shows`                          | List manageable shows           |
| `POST`   | `/api/v1/shows`                          | Create a company-scoped show    |
| `POST`   | `/api/v1/shows/:showId/tasks`            | Add a task to a manageable show |
| `POST`   | `/api/v1/shows/:showId/assignments`      | Assign an employee to a show    |
| `GET`    | `/api/v1/timesheets/options`             | List the employee's assignments |
| `GET`    | `/api/v1/timesheets?workDate=YYYY-MM-DD` | Read one task-time day          |
| `POST`   | `/api/v1/timesheets/entries`             | Create a draft entry            |
| `DELETE` | `/api/v1/timesheets/entries/:entryId`    | Delete the employee's draft     |
| `POST`   | `/api/v1/timesheets/submit`              | Submit all drafts for a date    |

Show routes require `show:manage`. Timesheet routes require
`timesheet:create` with `self` or `company` scope; every read and mutation is
still pinned to the authenticated employee identifier on the server.

## Next slice

The next implementation slice will reconcile biometric, access-card, website
sessions, and task entries into a daily timecard with anomalies. Approval
queues will then let the authorized Show Manager decide submitted task entries
without widening their ABAC scope.
