/**
 * Mocked shell data until the corresponding APIs exist. Keep every mock here so it is obvious what
 * still needs wiring: LinkedIn integration status (T-038) and unread notifications (T-047).
 */
export type LinkedInConnectionStatus = "CONNECTED" | "ATTENTION" | "DISCONNECTED";

export const MOCK_LINKEDIN_STATUS: LinkedInConnectionStatus = "CONNECTED";
export const MOCK_UNREAD_NOTIFICATIONS = 0;
export const MOCK_ACCOUNT_NAME = "Rodrigo";
