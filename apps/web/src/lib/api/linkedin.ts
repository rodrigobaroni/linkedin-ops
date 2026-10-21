import {
  LinkedInIntegrationSchema,
  type RouteDefinition,
  defineRoutes,
  routesV1,
} from "@linkedin-ops/contracts";
import { z } from "zod";
import type { ApiClient } from "./http";

/**
 * LinkedIn connection for the "Publicar" page (MVP-0). PROVISIONAL and isolated here until Pêndulo's
 * contracts branch lands: the official `LinkedInIntegrationSchema` gains `memberName`; until then it is
 * accepted as optional so the page works against either shape. Delete the extension when it is merged.
 */
export const LinkedInConnectionSchema = LinkedInIntegrationSchema.extend({
  memberName: z.string().max(200).nullable().optional(),
}).transform((value) => ({ ...value, memberName: value.memberName ?? null }));
export type LinkedInConnection = z.output<typeof LinkedInConnectionSchema>;

const routes = defineRoutes({
  get: {
    ...routesV1["integrations.linkedin.get"],
    responses: { 200: LinkedInConnectionSchema },
  },
  // 🔐 elevated + OWNER: both go through `useReauth().withElevation`.
  connect: routesV1["integrations.linkedin.connect"],
  disconnect: routesV1["integrations.linkedin.disconnect"],
} satisfies Record<string, RouteDefinition>);

export const LINKEDIN_CONNECTION_QUERY_KEY = ["integrations", "linkedin"] as const;

export function createLinkedInApi(client: ApiClient) {
  return {
    /** `GET /integrations/linkedin`: status, scopes, expiry and member — never the token. */
    get: (signal?: AbortSignal) => client.request(routes.get, { signal }),
    /** `POST /integrations/linkedin/connect` (🔐): the browser must then navigate to `authorizeUrl`. */
    connect: () => client.request(routes.connect),
    /** `DELETE /integrations/linkedin` (🔐): revokes and removes the token server-side. */
    disconnect: () => client.request(routes.disconnect),
  };
}
export type LinkedInApi = ReturnType<typeof createLinkedInApi>;

/**
 * Who the connection publishes as: the member's name, else the member URN. `null` means the account cannot be
 * identified, and the confirmation must never ask to publish to an unnamed account (Sentinela condition 7).
 */
export function connectionIdentity(connection: LinkedInConnection | undefined): string | null {
  return connection?.memberName || connection?.memberUrn || null;
}

/**
 * Whether the page may offer "Publicar agora": an `ACTIVE` connection (the API decides; this only reads its
 * status) whose account can be shown on the confirmation.
 */
export function canPublish(connection: LinkedInConnection | undefined): boolean {
  return connection?.status === "ACTIVE" && connectionIdentity(connection) !== null;
}
