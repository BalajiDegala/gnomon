# Leave Approval Route Import

Administrators can upload `approvals.csv` from **Administration → Site preferences**.
The importer accepts the supplied two-section spreadsheet export:

- **Support Approval** rows are retained as reference. The first approver for support
  employees continues to come from each employee's `Leave Approver 1` value in
  `users.csv`, because the support section does not identify an approval stage.
- **Artist Approval** rows marked `Artist First Approval` configure stage 1.
- Artist rows marked `2nd Approval` configure stage 2. When several people cover the
  same department, they form an any-of pool: one decision from any listed person
  completes stage 2.

The sheet abbreviations map to the user-directory departments as follows:

| Sheet label | Gnomon department(s)                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| Roto        | Roto                                                                                 |
| Paint       | Paint                                                                                |
| Integ       | Integration                                                                          |
| Comp        | Compositing                                                                          |
| CG          | CG, CG Generalist, Animation, Asset Build, Environment, Lighting, Lookdev, Texturing |

Approver names must resolve uniquely to an active `users.csv` employee. Uploads never
create employee identities. The response reports unresolved names and unknown
department labels so an administrator can correct the source rather than receiving a
silently incomplete route.

Every new leave request snapshots its department's current approval route. Later
policy changes therefore affect new requests only; existing pending requests retain
the approver names and identifiers that applied when they were submitted.
