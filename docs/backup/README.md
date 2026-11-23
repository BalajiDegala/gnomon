# Handover cleanup backup

Created on **12 October 2026**. This folder preserves material removed from the
main handover view. The current documents are listed in
[the documentation index](../README.md).

## What is stored here

| Location                                        | Contents                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [2026-10-12/docs](2026-10-12/docs/)             | All 14 documents as they existed before cleanup: 10 moved here, 4 copied here before keeping their active versions |
| [Original project README](2026-10-12/README.md) | The previous README, including historical release claims; use the current runbook for handover                     |
| `2026-10-12/configuration`                      | Original Git, Docker, and Prettier ignore files                                                                    |
| [Manifest](2026-10-12/MANIFEST.json)            | Original paths, backup paths, actions, and content checksums                                                       |
| `2026-10-12/local-only`                         | Locally retained generated reports/cache files and protected private notes; ignored by Git                         |

Archived documents are snapshots. Their historical status statements do not prove
the current environment is running that version. Do not update these copies as
living documentation; update the documents directly under `docs` instead.

## Optional supporting references

| Reference                                                                  | Why it moved out of the main handover folder                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Original MVP plan](2026-10-12/docs/MVP_PLAN.md)                           | Historical scope and implementation plan                                    |
| [Earlier policy administration](2026-10-12/docs/POLICY_ADMINISTRATION.md)  | Describes earlier location/branch behavior that differs from the current UI |
| [Demo data](2026-10-12/docs/DEMO_DATA.md)                                  | Optional development/demo setup                                             |
| [Local images and standalone Helm](2026-10-12/docs/LOCAL_DOCKER_IMAGES.md) | Optional standalone deployment reference; the shared lab uses GitOps        |
| [Attendance calculation](2026-10-12/docs/RECONCILIATION_POLICY.md)         | Detailed rules already summarized in the runbook                            |
| [Attendance corrections](2026-10-12/docs/REGULARISATION_WORKFLOW.md)       | Detailed workflow and API reference                                         |
| [Leave and personal calendar](2026-10-12/docs/LEAVE_CALENDAR_WORKFLOW.md)  | Detailed workflow and test setup                                            |
| [Approval route import](2026-10-12/docs/APPROVAL_ROUTE_IMPORT.md)          | Supporting department mapping details                                       |
| [Team calendar](2026-10-12/docs/TEAM_CALENDAR_WORKFLOW.md)                 | Supporting scope, privacy, and API details                                  |
| [Show timesheets](2026-10-12/docs/TIMESHEET_WORKFLOW.md)                   | Detailed workflow and API reference                                         |

## Generated and private material

Seven generated paths were moved into `2026-10-12/local-only`, preserving their
original folder structure:

- `coverage`
- `apps/api/coverage`
- `apps/web/coverage`
- `packages/shared/coverage`
- `apps/web/test-results`
- `apps/web/tsconfig.app.tsbuildinfo`
- `apps/web/tsconfig.node.tsbuildinfo`

The former root `cred` notes are held at `2026-10-12/local-only/private/cred` with
restricted filesystem permissions. Their contents were not printed or copied into
the documentation. Leave `local-only` out of shared folder copies. Git excludes it;
Docker and Prettier exclude the entire backup folder.

The active `.env.local`, imported `data`, installed `node_modules`, built `dist`
folders, and local Compose override remain in place to preserve the working setup.
These local files do not all belong in a source-only handover.

## Restore a file if needed

Use `original_path` and `backup_path` in the manifest to find the saved version.
Compare it with any file now at the original path, then copy the selected version
back. Keep the backup until the handover has been accepted. Generated reports can
also be recreated by rerunning the appropriate build or tests.

This is a **folder-cleanup backup**, not a MongoDB backup or a substitute for the
recovery procedure in the [handover runbook](../HANDOVER_RUNBOOK.md#11-backup-and-recovery).
