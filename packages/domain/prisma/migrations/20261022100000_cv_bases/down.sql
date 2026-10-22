-- Rollback of 20261022100000_cv_bases. Run only following docs/runbooks/database-migrations.md,
-- then `prisma migrate resolve --rolled-back 20261022100000_cv_bases`.
-- DESTRUCTIVE: deletes every CV base (personal data, not recoverable except from the encrypted backup).
DROP TABLE IF EXISTS "cv_bases";
DROP TYPE IF EXISTS "cv_extraction_failure";
DROP TYPE IF EXISTS "cv_draft_status";
