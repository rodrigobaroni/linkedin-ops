import {
  OWNER_ONLY,
  PublicationSchema,
  type RouteDefinition,
  UuidSchema,
  defineRoutes,
  paginated,
  routesV1,
} from "@linkedin-ops/contracts";
import { z } from "zod";
import type { ApiClient } from "./http";

/** LinkedIn's limit for the commentary of a member post. */
export const LINKEDIN_POST_MAX_LENGTH = 3000;

/**
 * PROVISIONAL and isolated here until Pêndulo's contracts (feat/T-061-linkedin-oauth-publish-mvp, a8821b1)
 * reach main: a publish-now post has no draft, so `draftId`/`draftVersionId` are nullable, and the
 * publication carries its `text`. Delete these extensions and the local `publishNow` route when
 * `publications.publishNow` is in `routesV1`.
 */
export const PublicationViewSchema = PublicationSchema.extend({
  draftId: UuidSchema.nullable(),
  draftVersionId: UuidSchema.nullable(),
  text: z.string().nullable().optional(),
}).transform((value) => ({ ...value, text: value.text ?? null }));
export type PublicationView = z.output<typeof PublicationViewSchema>;

/** Body of `POST /publications/publish-now`; the idempotency key travels only in the header. */
export const PublishNowInputSchema = z.object({
  text: z.string().trim().min(1).max(LINKEDIN_POST_MAX_LENGTH),
});
export type PublishNowInput = z.input<typeof PublishNowInputSchema>;

const routes = defineRoutes({
  list: {
    ...routesV1["publications.list"],
    responses: { 200: paginated(PublicationViewSchema) },
  },
  publishNow: {
    method: "POST",
    path: "/publications/publish-now",
    summary: "Publish a text post now (elevated session)",
    tag: "publications",
    auth: "elevated",
    roles: OWNER_ONLY,
    body: PublishNowInputSchema,
    responses: { 201: PublicationViewSchema },
    idempotencyKey: "required",
    rateLimited: true,
  },
} satisfies Record<string, RouteDefinition>);

export const PUBLICATIONS_QUERY_KEY = ["publications", "recent"] as const;
export const RECENT_PUBLICATIONS_LIMIT = 10;

export function createPublicationsApi(client: ApiClient) {
  return {
    /** First page of `GET /publications` (most recent first, server order). */
    listRecent: (signal?: AbortSignal) =>
      client.request(routes.list, { query: { limit: RECENT_PUBLICATIONS_LIMIT }, signal }),
    /**
     * `POST /publications/publish-now` (🔐). `idempotencyKey` (UUID, `Idempotency-Key` header) is created once
     * per attempt and reused when retrying it, so the same submission can never publish twice.
     */
    publishNow: (input: PublishNowInput, idempotencyKey: string) =>
      client.request(routes.publishNow, { body: input, idempotencyKey }),
  };
}
export type PublicationsApi = ReturnType<typeof createPublicationsApi>;

/** Public URL of a post: the API's `externalUrl` when present, otherwise derived from the URN. */
export function publicationUrl(publication: PublicationView): string | null {
  if (publication.externalUrl) return publication.externalUrl;
  if (!publication.externalPostId) return null;
  // `externalPostId` is a validated LinkedIn URN (`urn:li:<type>:<id>`), safe in the path as is.
  return `https://www.linkedin.com/feed/update/${publication.externalPostId}/`;
}
