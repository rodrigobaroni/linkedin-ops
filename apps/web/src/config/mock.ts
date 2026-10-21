/**
 * Mocked shell data until the corresponding APIs exist. Keep every mock here so it is obvious what
 * still needs wiring: unread notifications (T-047). Account name and LinkedIn connection now come from
 * `GET /auth/me` (T-015); the `ATTENTION` status (token expiring) arrives with the integration API (T-038).
 */
export type LinkedInConnectionStatus = "CONNECTED" | "ATTENTION" | "DISCONNECTED";

export const MOCK_UNREAD_NOTIFICATIONS = 0;

export function linkedInStatusFromSession(linkedinConnected: boolean): LinkedInConnectionStatus {
  return linkedinConnected ? "CONNECTED" : "DISCONNECTED";
}
