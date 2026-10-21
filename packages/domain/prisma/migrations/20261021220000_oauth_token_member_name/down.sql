-- Rollback of 20261021220000_oauth_token_member_name. Run only following docs/runbooks/database-migrations.md,
-- then `prisma migrate resolve --rolled-back 20261021220000_oauth_token_member_name`.
-- Loses only the display name; the connection itself keeps working (the panel shows no name until reconnect).
ALTER TABLE "oauth_tokens" DROP CONSTRAINT IF EXISTS "oauth_tokens_member_name_check";
ALTER TABLE "oauth_tokens" DROP COLUMN "member_name";
