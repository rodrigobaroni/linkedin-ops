-- T-038 núcleo / MVP-0: display name of the connected LinkedIn member (OIDC `userinfo.name`), shown on
-- the publish confirmation (Sentinela condition 7). Additive only: existing rows keep NULL.

-- AlterTable
ALTER TABLE "oauth_tokens" ADD COLUMN     "member_name" TEXT;

-- CHECK constraints (hand-written)
-- Bounded like the contract (`LinkedInIntegration.memberName`, 1..200 chars).
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_member_name_check"
  CHECK ("member_name" IS NULL OR char_length("member_name") BETWEEN 1 AND 200);
