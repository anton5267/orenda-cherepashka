# Orenda application data recovery

The production project is `suzmndaqwchayddrulzc`. Its Free plan has no scheduled
project backups. SQLite backups belong to the alternative local server and do
not protect production data.

## Verified application snapshot

On 2026-10-16, a read-only, transaction-consistent export of all six `public`
application tables was saved separately from Supabase and the Git checkout:

`C:\Users\Legion\Documents\OrendaBackups\orenda-application-2026-10-16.json`

The snapshot contains 47 content records (35 products, six categories, five FAQ,
one manual news item) and one settings row. Leads, analytics, rate limits and
webhook events were empty at export. No test lead was created.

An isolated PostgreSQL 17 container restored the repository schema and all data.
Every table's sorted JSON digest matched the snapshot; RLS, browser-role grants,
the analytics function and the webhook-event identity sequence were checked.
The container had no network, host ports or persistent mounts and was removed.

This is **application data recovery**, not a complete Supabase project backup.
Auth users/passwords/sessions, Storage files, managed schemas, Edge Function
secrets and Cloudflare configuration are excluded. The single owner account
must be re-invited through Supabase Auth after a disaster; never insert it into
`auth.users` manually. Function code, migrations and Pages configuration are
tracked in Git. Keep server secrets in the owner's password manager.

## Repeat the export and restore drill

1. Open the Orenda Dashboard SQL Editor and verify the project ref.
2. Run [backup/export-application.sql](backup/export-application.sql). It only
   reads application tables. Save the complete `application_backup` JSON cell,
   not a truncated screenshot or the default 100-row table export.
3. Store the JSON in a private folder outside the checkout. Future exports may
   contain customer contacts. Do not commit, attach to a PR, or publish them.
4. With Docker running, verify it locally:

   ```powershell
   npm run supabase:verify-backup -- "C:\Users\Legion\Documents\OrendaBackups\orenda-application-2026-10-16.json" "artifacts\restore-report.json" "backups\restore-application.sql"
   ```

   Create the output directories first. The verifier accepts only this project's
   application backup format. It has no remote DB URL and never connects to
   production. `restore-application.sql` is written only after successful checks.

5. Retain at least 14 daily snapshots, plus a snapshot before catalog/schema
   changes. This daily export is currently **manual**, not a configured scheduled
   job. A day without an export creates a recovery gap. Keep another encrypted
   copy on separately managed storage; choose its destination with the owner.
6. Repeat the restore drill after schema changes and periodically thereafter.
   Keep the report's timestamp, counts, snapshot SHA256 and pinned image digest.

## During a real incident

Provision a fresh Supabase project using the owner's approved plan. Apply the
reviewed schema migrations to that empty project first. Review the generated
restore SQL, confirm the destination, and execute it there. **It truncates the six
application tables; do not run it on a working production database.** Compare
table counts/digests and RLS, then redeploy the three Edge Functions, restore their
server-only secrets, disable public signup, configure Auth URLs, and invite the
owner through Supabase Auth. Update Pages' public project URL/key and run the
production acceptance checks before routing customers to the replacement.

For full project recovery including Auth/managed schemas, configure the
[official CLI backup/restore workflow](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
with owner-managed database credentials and test it separately. That full dump
and a separately managed encrypted second copy have **not** been completed.
See [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups)
for Storage exclusions and plan limits.
