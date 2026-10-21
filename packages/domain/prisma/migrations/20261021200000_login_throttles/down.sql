-- Rollback of 20261021200000_login_throttles (T-015). Drops the counters only (no user data): an active
-- lockout is lost. Then `prisma migrate resolve --rolled-back 20261021200000_login_throttles`.
DROP TABLE IF EXISTS "login_throttles";
