# Data dictionary (starter)

The Apps Script `SCHEMA` object is the canonical header definition. Keep header names unchanged unless both backend and app are updated.

## Relationships
- `Rescue.CaseID` identifies a rescue case; treatment and stock issue records may reference it.
- `Animals.AnimalID` identifies an animal across rescue, treatment, adoption and follow-up records.
- `Finance.Fund` associates a donation/expense with a fund or grant.
- `Stock.ItemID` + `Stock.Batch` + `Stock.Expiry` identify a batch movement; available stock must eventually be calculated from all approved movements, not typed manually.
- `Procurement` records requests and purchase metadata; goods receipts and supplier invoice workflows should be implemented before live stock and finance integration.
- `Vouchers`, `JournalEntries`, and `JournalLines` are reserved for the planned accounting ledger. The starter does not yet post double-entry journals.
- `AuditLog` captures starter create/login events. Production must log edits, approvals, posting, reversals, exports, and role changes too.

## Required production additions
1. Enforce record-level and fund-level permissions server-side.
2. Implement admin-only user management and role-change history.
3. Implement approved financial posting with balanced debits/credits and reversal entries.
4. Implement purchase order → goods receipt → stock batch → supplier invoice → payment relationships.
5. Implement stock issue validation against available quantity and batch expiry.
6. Store attachments in a restricted Drive folder and retain file IDs/permissions in the database.
7. Add idempotency, retry limits, rate limits, session revocation, audit retention, and backup/restore tests.
