/**
 * Which hosts and resolved addresses an outbound request may reach (ADR-0008 §5). Checked twice: on the host of
 * the URL (no IP literal, no internal name) and on every address the host resolves to, so a public name that
 * points inside (`10.0.0.1.nip.io`, DNS rebinding, `metadata.google.internal`) is refused after resolution.
 */
import { BlockList, isIP } from "node:net";

/** Non-global IPv4 ranges (IANA special-purpose registry), including the cloud metadata address. */
const BLOCKED_IPV4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

/**
 * Special IPv6 ranges inside the global unicast block 2000::/3; everything outside 2000::/3 (loopback,
 * unspecified, IPv4-mapped, ULA, link-local, multicast) is refused before this list is checked.
 */
const BLOCKED_IPV6 = [
  "2001::/32", // Teredo: tunnels to an arbitrary IPv4
  "2001:10::/28",
  "2001:20::/28",
  "2001:db8::/32",
  "2002::/16", // 6to4: embeds an arbitrary IPv4
];
const GLOBAL_IPV6 = "2000::/3";

/** Single-label names resolve through the container's search domains (`metadata`, `db`): refused too. */
const BLOCKED_NAME_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

export interface AddressPolicyOptions {
  /** Extra CIDRs to refuse, such as the Docker/VM networks of the host (`172.30.0.0/16`, `fd00:1::/64`). */
  extraBlockedCidrs?: readonly string[];
}

export class AddressPolicy {
  private readonly blocked = new BlockList();
  private readonly global6 = new BlockList();

  constructor(options: AddressPolicyOptions = {}) {
    for (const cidr of BLOCKED_IPV4) addCidr(this.blocked, cidr);
    for (const cidr of BLOCKED_IPV6) addCidr(this.blocked, cidr);
    for (const cidr of options.extraBlockedCidrs ?? []) addCidr(this.blocked, cidr);
    addCidr(this.global6, GLOBAL_IPV6);
  }

  /** True when `hostname` (as `URL.hostname` gives it) may be resolved at all. */
  allowsHostname(hostname: string): boolean {
    const name = hostname.toLowerCase().replace(/\.+$/, "");
    if (name === "" || isIP(stripBrackets(name)) !== 0) return false;
    if (!name.includes(".") || name === "localhost") return false;
    return !BLOCKED_NAME_SUFFIXES.some((suffix) => name.endsWith(suffix));
  }

  /** True when a resolved address is public. */
  allowsAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !this.blocked.check(address, "ipv4");
    if (family === 6) {
      return this.global6.check(address, "ipv6") && !this.blocked.check(address, "ipv6");
    }
    return false;
  }
}

function addCidr(list: BlockList, cidr: string): void {
  const [network, prefix] = cidr.split("/");
  const family = isIP(network ?? "");
  if (family === 0 || prefix === undefined || !/^\d{1,3}$/.test(prefix)) {
    throw new TypeError(`Invalid CIDR: ${cidr}`);
  }
  list.addSubnet(network as string, Number(prefix), family === 4 ? "ipv4" : "ipv6");
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}
