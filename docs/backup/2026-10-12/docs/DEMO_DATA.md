# Demo Data

The local demo seed creates a repeatable workforce dataset for reviewing the MVP.
It resets only records owned by employees and shows whose codes start with `DEMO`.
Existing administrator, imported, and manually created records are preserved.

Run it while the local MongoDB container is available:

```powershell
npm run seed:demo
```

The seed includes:

- Nine employees in the single Mumbai demo branch
- Reporting Manager, Show Manager, HR, Attendance Administrator, and Employee roles
- Project Orion, Nova Campaign, and Atlas Trailer shows
- Ten past workdays of biometric, access-card, website-session, and timesheet data
- Direct-saved timesheet entries across active shows with comments and progress values
- Pending, approved, and rejected leave requests with annual balances
- Pending-manager, pending-HR, and approved regularisation requests
- Reconciled daily attendance records for reports and calendars

All demo accounts use `demo-password-123` by default.

| Persona           | Login                          |
| ----------------- | ------------------------------ |
| Employee          | `demo.asha@example.com`        |
| Reporting Manager | `demo.manager@example.com`     |
| Show Manager      | `demo.showmanager@example.com` |
| HR                | `demo.hr@example.com`          |
| Attendance Admin  | `demo.attendance@example.com`  |

Additional artist accounts use `demo.rohan@example.com`, `demo.isha@example.com`,
`demo.dev@example.com`, and `demo.tara@example.com` with the same password.

Set `DEMO_PASSWORD` before running the command to use a different password. The
script refuses to run when `NODE_ENV=production`.
