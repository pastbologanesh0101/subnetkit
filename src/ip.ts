/**
 * Core IPv4 math. Everything here is pure and works on unsigned 32-bit integers
 * held in regular JS numbers (0 .. 2^32-1). Use `>>> 0` after bitwise ops to
 * stay unsigned.
 */

export interface SubnetInfo {
  /** The address as typed, normalised (host bits preserved). */
  address: string;
  /** Prefix length, 0-32. */
  prefix: number;
  /** Network (base) address. */
  network: string;
  /** Broadcast address. */
  broadcast: string;
  /** Subnet mask in dotted-decimal, e.g. 255.255.255.0. */
  netmask: string;
  /** Inverse of the mask, e.g. 0.0.0.255. */
  wildcard: string;
  /** First usable host, or null when the block is too small to have one. */
  firstHost: string | null;
  /** Last usable host, or null when the block is too small to have one. */
  lastHost: string | null;
  /** Total addresses in the block (2 ** (32 - prefix)). */
  totalHosts: number;
  /** Usable hosts (totalHosts - 2, except /31 and /32). */
  usableHosts: number;
  /** True for RFC 1918 space. */
  isPrivate: boolean;
  /** CIDR of the containing network, e.g. 192.168.1.0/24. */
  cidr: string;
}

const OCTET = /^\d{1,3}$/;

/** Parse a dotted-decimal string into a uint32. Throws on malformed input. */
export function ipToInt(ip: string): number {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) {
    throw new Error(`Invalid IPv4 address: "${ip}"`);
  }
  let acc = 0;
  for (const part of parts) {
    if (!OCTET.test(part)) {
      throw new Error(`Invalid IPv4 address: "${ip}"`);
    }
    const n = Number(part);
    if (n > 255) {
      throw new Error(`Invalid IPv4 address: "${ip}" (octet ${n} > 255)`);
    }
    acc = (acc << 8) | n;
  }
  return acc >>> 0;
}

/** Format a uint32 back into dotted-decimal. */
export function intToIp(int: number): string {
  const n = int >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** Build a netmask uint32 from a prefix length. */
export function prefixToMask(prefix: number): number {
  assertPrefix(prefix);
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** Recover a prefix length from a mask, throwing if the mask is non-contiguous. */
export function maskToPrefix(mask: string): number {
  const int = ipToInt(mask);
  const prefix = 32 - Math.log2((~int >>> 0) + 1);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Not a valid contiguous subnet mask: "${mask}"`);
  }
  // Guard against masks like 255.0.255.0 that slip past the log2 check.
  if (prefixToMask(prefix) !== int) {
    throw new Error(`Not a valid contiguous subnet mask: "${mask}"`);
  }
  return prefix;
}

function assertPrefix(prefix: number): void {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Prefix must be an integer 0-32, got ${prefix}`);
  }
}

/**
 * Split "1.2.3.4/24" or "1.2.3.4 255.255.255.0" or bare "1.2.3.4" (implicit /32)
 * into [ipInt, prefix].
 */
export function parseCidr(input: string): [number, number] {
  const trimmed = input.trim();
  const slash = trimmed.split("/");
  if (slash.length === 2) {
    const prefix = Number(slash[1]);
    if (!/^\d{1,2}$/.test(slash[1]!.trim())) {
      throw new Error(`Invalid prefix in "${input}"`);
    }
    assertPrefix(prefix);
    return [ipToInt(slash[0]!), prefix];
  }
  const space = trimmed.split(/\s+/);
  if (space.length === 2) {
    return [ipToInt(space[0]!), maskToPrefix(space[1]!)];
  }
  return [ipToInt(trimmed), 32];
}

function isPrivate(ipInt: number): boolean {
  return (
    (ipInt >>> 24) === 10 ||
    (ipInt >>> 20) === 0xac1 || // 172.16.0.0/12
    (ipInt >>> 16) === 0xc0a8 // 192.168.0.0/16
  );
}

/** Compute the full picture for a CIDR / ip+mask / bare address. */
export function describe(input: string): SubnetInfo {
  const [ipInt, prefix] = parseCidr(input);
  const mask = prefixToMask(prefix);
  const network = (ipInt & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);

  let firstHost: string | null;
  let lastHost: string | null;
  let usable: number;
  if (prefix >= 31) {
    // /31 (RFC 3021 point-to-point) and /32 have no network/broadcast split.
    firstHost = intToIp(network);
    lastHost = intToIp(broadcast);
    usable = prefix === 32 ? 1 : 2;
  } else {
    firstHost = intToIp((network + 1) >>> 0);
    lastHost = intToIp((broadcast - 1) >>> 0);
    usable = total - 2;
  }

  return {
    address: intToIp(ipInt),
    prefix,
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    netmask: intToIp(mask),
    wildcard: intToIp(~mask >>> 0),
    firstHost,
    lastHost,
    totalHosts: total,
    usableHosts: usable,
    isPrivate: isPrivate(network),
    cidr: `${intToIp(network)}/${prefix}`,
  };
}

/** Is `ip` inside `cidr`? */
export function contains(cidr: string, ip: string): boolean {
  const [netInt, prefix] = parseCidr(cidr);
  const mask = prefixToMask(prefix);
  const target = ipToInt(ip);
  return ((netInt & mask) >>> 0) === ((target & mask) >>> 0);
}

/**
 * Divide `cidr` into equal blocks.
 *
 * - `{ newPrefix }` cuts to that prefix length.
 * - `{ count }` cuts into the smallest power-of-two >= count blocks.
 *
 * Returns the child networks as CIDR strings, in order.
 */
export function split(
  cidr: string,
  opts: { newPrefix?: number; count?: number },
): string[] {
  const [ipInt, prefix] = parseCidr(cidr);
  const base = (ipInt & prefixToMask(prefix)) >>> 0;

  let newPrefix: number;
  if (opts.newPrefix != null) {
    newPrefix = opts.newPrefix;
  } else if (opts.count != null) {
    if (opts.count < 1) throw new Error("count must be >= 1");
    newPrefix = prefix + Math.ceil(Math.log2(opts.count));
  } else {
    throw new Error("split needs either newPrefix or count");
  }
  assertPrefix(newPrefix);
  if (newPrefix < prefix) {
    throw new Error(
      `Cannot split /${prefix} into larger /${newPrefix} blocks`,
    );
  }

  const step = 2 ** (32 - newPrefix);
  const blocks = 2 ** (newPrefix - prefix);
  const out: string[] = [];
  for (let i = 0; i < blocks; i++) {
    out.push(`${intToIp((base + i * step) >>> 0)}/${newPrefix}`);
  }
  return out;
}
