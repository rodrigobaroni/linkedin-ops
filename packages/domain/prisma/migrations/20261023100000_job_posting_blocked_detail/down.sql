-- Rollback of 20261023100000_job_posting_blocked_detail. Run only following docs/runbooks/database-migrations.md,
-- then `prisma migrate resolve --rolled-back 20261023100000_job_posting_blocked_detail`. Loses only the detail
-- of blocked postings (the failure reason stays).
ALTER TABLE "job_postings" DROP CONSTRAINT IF EXISTS "job_postings_blocked_detail_check";
ALTER TABLE "job_postings" DROP COLUMN IF EXISTS "blocked_retry_at";
ALTER TABLE "job_postings" DROP COLUMN IF EXISTS "blocked_kind";
DROP TYPE IF EXISTS "job_posting_blocked_kind";
