"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Skeleton,
  Spinner,
} from "@linkedin-ops/ui";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useId, useState } from "react";
import { useReauth } from "@/hooks/use-reauth";
import { messages } from "@/i18n/pt-br";
import { LINKEDIN_CONNECTION_QUERY_KEY, type LinkedInConnection } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import {
  formatDateTime,
  isLinkedInAuthorizeUrl,
  useLinkedInConnection,
  usePublishingApi,
} from "./use-publishing";

const copy = messages.publish.connection;
const DAY_MS = 24 * 60 * 60_000;
/** Warn this many days before the access token expires (no refresh token in MVP-0). */
const EXPIRY_WARNING_DAYS = 7;

export type LinkedInConnectionCardProps = {
  /** Test seam for the OAuth redirect; defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
};

/**
 * Connection status for the "Publicar" page: who is connected, until when, and the 🔐 connect/reconnect
 * and disconnect actions (both through `withElevation`). The token itself never reaches the web.
 */
export function LinkedInConnectionCard({
  navigate = defaultNavigate,
}: LinkedInConnectionCardProps) {
  const connection = useLinkedInConnection();
  const { linkedin } = usePublishingApi();
  const { withElevation } = useReauth();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [pending, setPending] = useState<"connect" | "disconnect" | null>(null);
  // Expiry is compared with the time the card was rendered; a page reload refreshes it.
  const [now] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    setPending("connect");
    try {
      const result = await withElevation(() => linkedin.connect());
      if (!result) return setPending(null);
      if (!isLinkedInAuthorizeUrl(result.authorizeUrl)) {
        setError(copy.invalidAuthorizeUrl);
        return setPending(null);
      }
      // Keep the pending state: the browser is leaving for LinkedIn.
      navigate(result.authorizeUrl);
    } catch {
      setError(copy.connectError);
      setPending(null);
    }
  }

  async function disconnect() {
    setError(null);
    setPending("disconnect");
    try {
      await withElevation(() => linkedin.disconnect());
    } catch {
      setError(copy.disconnectError);
    } finally {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: LINKEDIN_CONNECTION_QUERY_KEY });
    }
  }

  return (
    <Card
      id="linkedin-connection"
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      aria-busy={connection.isPending || undefined}
    >
      <CardHeader>
        <h2 id={titleId} className="text-lg font-semibold leading-7">
          {copy.title}
        </h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {connection.isPending ? (
          <>
            <span className="sr-only" role="status">
              {copy.loading}
            </span>
            <Skeleton className="h-6 w-48" />
          </>
        ) : connection.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{copy.loadError}</AlertDescription>
          </Alert>
        ) : (
          <ConnectionDetails connection={connection.data} timeZone={user?.timezone} now={now} />
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      {connection.data ? (
        <CardFooter>
          {connection.data.status === "ACTIVE" ? (
            <Button
              variant="outline"
              className="max-md:h-11"
              disabled={pending !== null}
              onClick={() => void disconnect()}
            >
              {pending === "disconnect" ? <Spinner /> : null}
              {pending === "disconnect" ? copy.disconnecting : copy.disconnect}
            </Button>
          ) : null}
          {connection.data.status !== "ACTIVE" || isExpiringSoon(connection.data, now) ? (
            <Button
              className="max-md:h-11"
              disabled={pending !== null}
              onClick={() => void connect()}
            >
              {pending === "connect" ? <Spinner /> : null}
              {pending === "connect"
                ? copy.connecting
                : connection.data.status === "DISCONNECTED"
                  ? copy.connect
                  : copy.reconnect}
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function ConnectionDetails({
  connection,
  timeZone,
  now,
}: {
  connection: LinkedInConnection;
  timeZone: string | undefined;
  now: number;
}) {
  const expiresAt = connection.accessExpiresAt;
  if (connection.status === "ACTIVE") {
    const daysLeft = expiresAt ? Math.ceil((Date.parse(expiresAt) - now) / DAY_MS) : null;
    return (
      <div className="flex flex-col gap-2">
        <p
          className="flex items-center gap-2 text-sm font-medium leading-6"
          data-testid="linkedin-connection-status"
        >
          <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0 text-success" />
          {connection.memberName ? copy.connectedAs(connection.memberName) : copy.connectedUnknown}
        </p>
        {expiresAt ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.expiresAt(formatDateTime(expiresAt, timeZone))}
          </p>
        ) : null}
        {daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS ? (
          <Alert variant="warning" role="status">
            <AlertDescription>{copy.expiringSoon(daysLeft)}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }
  if (connection.status === "DISCONNECTED") {
    return (
      <div className="flex flex-col gap-2">
        <p
          className="flex items-center gap-2 text-sm font-medium leading-6"
          data-testid="linkedin-connection-status"
        >
          <CircleXIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          {copy.disconnected}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">{copy.disconnectedHint}</p>
      </div>
    );
  }
  // EXPIRED or REAUTH_REQUIRED: explain and offer the reconnection path.
  return (
    <div className="flex flex-col gap-2">
      <p
        className="flex items-center gap-2 text-sm font-medium leading-6"
        data-testid="linkedin-connection-status"
      >
        <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-warning-foreground" />
        {connection.status === "EXPIRED" ? copy.expired : copy.reauthRequired}
        {connection.memberName ? ` — ${connection.memberName}` : null}
      </p>
      {connection.status === "EXPIRED" && expiresAt ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.expiredAt(formatDateTime(expiresAt, timeZone))}
        </p>
      ) : null}
      <Alert variant="warning" role="status">
        <AlertDescription>{copy.reconnectHint}</AlertDescription>
      </Alert>
    </div>
  );
}

function isExpiringSoon(connection: LinkedInConnection, now: number): boolean {
  if (connection.status !== "ACTIVE" || !connection.accessExpiresAt) return false;
  return Date.parse(connection.accessExpiresAt) - now <= EXPIRY_WARNING_DAYS * DAY_MS;
}

function defaultNavigate(url: string) {
  window.location.assign(url);
}
