/**
 * LinkedIn official API surface used by the MVP (docs/security/linkedin-policy.md). Endpoints, scopes and
 * the pinned `LinkedIn-Version` live here so the OAuth flow, the publisher and the T-061 probe agree.
 */

export const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts";

/** Sentinela condition 1 (2026-10-21): exactly these scopes, no `email`. */
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"] as const;

/** Pinned `LinkedIn-Version` (YYYYMM); a change requires a new probe run (docs/security/linkedin-api-proof.md). */
export const LINKEDIN_API_VERSION = "202608";
export const LINKEDIN_RESTLI_PROTOCOL_VERSION = "2.0.0";

/** Upper bound of `commentary` accepted by `POST /rest/posts`. */
export const LINKEDIN_COMMENTARY_MAX_LENGTH = 3000;

/** Public URL of a post given its URN (`urn:li:share:…` / `urn:li:ugcPost:…`). */
export function linkedinPostUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${postUrn}/`;
}

/** OIDC issuer and JWKS of LinkedIn's "Sign In with LinkedIn using OpenID Connect" (id_token checks). */
export const LINKEDIN_OIDC_ISSUER = "https://www.linkedin.com/oauth";
export const LINKEDIN_JWKS_URL = "https://www.linkedin.com/oauth/openid/jwks";
