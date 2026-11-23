# MVP Stabilization Backlog

This backlog tracks basic workflow quality before adding more product modules.
Items are ordered by user impact and dependency, not by screen ownership.

## Completed

### URL-backed page navigation

- Every primary page has a stable path.
- Refresh keeps the current page.
- Browser back and forward navigate between pages.
- Direct links survive sign-in.
- Unknown or unauthorized paths return to the overview.
- Sidebar navigation uses real links and updates the document title.

### URL-backed page context

Durable, non-sensitive page state is stored in validated URL query parameters:

- Timesheet and regularisation work date
- Personal and team calendar month
- Team calendar audience or show
- Reporting date range and selected report tab
- Administration section
- People search and status filter

Copying, refreshing, or revisiting a URL restores the same view. Invalid values
fall back to safe page defaults, and unavailable team audiences are removed.
Incomplete or sensitive form fields are never written to the URL.

### Protected incomplete forms

Timesheet, leave, regularisation, employee, show, holiday, and leave-balance forms
now warn before discarding unsaved work. Safe drafts are scoped to the signed-in
employee and restored from session storage. Successful saves and confirmed discards
clear their drafts.

Passwords, access-role forms, and uploaded attendance files are intentionally never
persisted.

## Priority B: Consistent Mutation Feedback

Standardize create, update, approve, reject, save, and delete behavior.

Acceptance criteria:

- Show one consistent success notification pattern.
- Keep API validation errors next to the affected workflow.
- Confirm destructive or irreversible actions.
- Disable duplicate submission while a request is running.
- Retain filters and scroll context after a mutation refreshes data.

## Priority C: Failure Recovery

Add an application error boundary and explicit recovery states.

Acceptance criteria:

- A rendering error does not blank the whole application.
- Expired sessions show a clear message and retain the requested page.
- Failed queries provide retry actions.
- Offline and API-unavailable states are distinguishable from empty data.

## Priority D: Accessibility And Responsive Audit

- Verify keyboard navigation and focus return for dialogs and drawers.
- Add accessible names to compact icon controls.
- Verify tables and approval cards at 320 px, tablet, and desktop widths.
- Check color contrast and status meaning without relying only on color.
- Remove controls that have no implemented action.

## Priority E: Frontend Performance

The production bundle currently exceeds the build tool's 500 kB warning threshold.

Acceptance criteria:

- Lazy-load page modules by route.
- Keep authentication and the application shell in the initial bundle.
- Measure the resulting initial and per-page chunks before setting a target.
