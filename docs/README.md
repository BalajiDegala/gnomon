# Handover documents

Start with the runbook. The other documents provide the details needed for imports,
deployment, and unfinished work.

| Document                                                   | Who needs it                         | What it covers                                                                                     |
| ---------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [Handover runbook](HANDOVER_RUNBOOK.md)                    | Everyone taking over the project     | Daily tasks, setup, releases, troubleshooting, recovery, contacts, and sign-off                    |
| [Attendance import formats](ATTENDANCE_CSV_FORMAT.md)      | Attendance operators and developers  | File formats, employee matching, validation, deletion/replacement, and interrupted-import recovery |
| [CI/CD and Kubernetes operations](CI_CD_DEPLOYMENT.md)     | Developers and infrastructure owners | Deployment configuration, platform setup, verification, and troubleshooting                        |
| [Outstanding usability work](MVP_STABILIZATION_BACKLOG.md) | Incoming developer and project owner | Existing improvement backlog to review and assign                                                  |

The runbook records the current handover findings, including the administrator
seed behavior and differences from older instructions. Live deployment details
and restore procedures still need verification by the incoming team.

## Where the other documents went

The [backup index](backup/README.md) lists older planning documents and optional
workflow, demo, and standalone-deployment references. They remain available, but
are not required reading for the initial handover. The runbook links directly to
them where more detail is useful.

The cleanup also archived generated test reports and build-cache files. Application
source, tests, deployment settings, local data, and installed runtime files were
preserved. No file contents were discarded.
