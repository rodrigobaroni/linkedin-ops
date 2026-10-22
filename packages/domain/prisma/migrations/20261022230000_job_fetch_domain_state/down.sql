-- Rollback of 20261022230000_job_fetch_domain_state (career PR 3a). Drops the limiter and breaker state only
-- (no user data): open breakers and quota windows are lost, so keep JOB_FETCH_LINKEDIN=disabled until the
-- fetcher is rolled back too. Then `prisma migrate resolve --rolled-back 20261022230000_job_fetch_domain_state`.
DROP TABLE IF EXISTS "job_fetch_domain_state";
