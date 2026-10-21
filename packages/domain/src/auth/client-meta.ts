import { isIPv4, isIPv6 } from "node:net";

export const USER_AGENT_MAX_LENGTH = 512;

/**
 * IP minimization for stored rows (data-and-lgpd.md): IPv4 keeps its /24 (`203.0.113.0`), IPv6 its /48
 * (`2001:db8:1::`); IPv4-mapped IPv6 is treated as IPv4. Anything unparseable is not stored.
 */
export function minimizeIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const mapped = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIPv4(mapped)) {
    const [a, b, c] = mapped.split(".");
    return `${a}.${b}.${c}.0`;
  }
  if (isIPv6(ip)) {
    const groups = expandIPv6(ip);
    return `${groups.slice(0, 3).join(":")}::`;
  }
  return null;
}

function expandIPv6(ip: string): string[] {
  const [head = "", tail = ""] = ip.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = ip.includes("::") ? (tail === "" ? [] : tail.split(":")) : [];
  const missing = 8 - left.length - right.length;
  return [...left, ...Array<string>(Math.max(0, missing)).fill("0"), ...right].map(
    (group) => group.replace(/^0+(?=.)/, "") || "0",
  );
}

export function truncateUserAgent(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  return userAgent.slice(0, USER_AGENT_MAX_LENGTH);
}
