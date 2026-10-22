-- Rollback of 20261023000000_career_job_postings. Run only following docs/runbooks/database-migrations.md,
-- then `prisma migrate resolve --rolled-back 20261023000000_career_job_postings`.
-- DESTRUCTIVE: deletes every batch, job posting and tailored CV (personal data, not recoverable except from
-- the encrypted backup). Jobs already queued for them exit quietly (their posting is gone).
DROP TABLE IF EXISTS "tailored_cvs";
DROP TABLE IF EXISTS "job_postings";
DROP TABLE IF EXISTS "tailoring_batches";
DROP TYPE IF EXISTS "job_posting_source_kind";
DROP TYPE IF EXISTS "job_posting_failure";
DROP TYPE IF EXISTS "job_posting_status";
