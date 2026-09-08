import { describe as group, it, expect } from "vitest";
import {
  describe,
  contains,
  split,
  ipToInt,
  intToIp,
  prefixToMask,
  maskToPrefix,
  parseCidr,
} from "../src/index.js";

group("ipToInt / intToIp", () => {
  it("round-trips common addresses", () => {
    for (const ip of ["0.0.0.0", "10.0.0.1", "192.168.1.255", "255.255.255.255"]) {
      expect(intToIp(ipToInt(ip))).toBe(ip);
    }
  });

  it("parses the high bit without going negative", () => {
    expect(ipToInt("255.255.255.255")).toBe(4294967295);
    expect(ipToInt("128.0.0.0")).toBe(2147483648);
  });

  it("rejects malformed input", () => {
    expect(() => ipToInt("1.2.3")).toThrow();
    expect(() => ipToInt("1.2.3.4.5")).toThrow();
    expect(() => ipToInt("1.2.3.256")).toThrow();
    expect(() => ipToInt("1.2.3.-1")).toThrow();
    expect(() => ipToInt("a.b.c.d")).toThrow();
  });
});

group("mask conversions", () => {
  it("prefixToMask", () => {
    expect(intToIp(prefixToMask(0))).toBe("0.0.0.0");
    expect(intToIp(prefixToMask(24))).toBe("255.255.255.0");
    expect(intToIp(prefixToMask(32))).toBe("255.255.255.255");
    expect(intToIp(prefixToMask(1))).toBe("128.0.0.0");
  });

  it("maskToPrefix", () => {
    expect(maskToPrefix("255.255.255.0")).toBe(24);
    expect(maskToPrefix("255.255.240.0")).toBe(20);
    expect(maskToPrefix("0.0.0.0")).toBe(0);
    expect(maskToPrefix("255.255.255.255")).toBe(32);
  });

  it("rejects non-contiguous masks", () => {
    expect(() => maskToPrefix("255.0.255.0")).toThrow();
    expect(() => maskToPrefix("255.255.1.0")).toThrow();
  });
});

group("parseCidr", () => {
  it("accepts slash notation", () => {
    expect(parseCidr("10.0.0.0/8")).toEqual([ipToInt("10.0.0.0"), 8]);
  });
  it("accepts ip + mask", () => {
    expect(parseCidr("10.0.0.0 255.255.255.0")).toEqual([ipToInt("10.0.0.0"), 24]);
  });
  it("treats a bare address as /32", () => {
    expect(parseCidr("10.0.0.1")).toEqual([ipToInt("10.0.0.1"), 32]);
  });
  it("rejects bad prefixes", () => {
    expect(() => parseCidr("10.0.0.0/33")).toThrow();
    expect(() => parseCidr("10.0.0.0/x")).toThrow();
  });
});

group("describe", () => {
  it("computes a /24", () => {
    const i = describe("192.168.1.10/24");
    expect(i.network).toBe("192.168.1.0");
    expect(i.broadcast).toBe("192.168.1.255");
    expect(i.netmask).toBe("255.255.255.0");
    expect(i.wildcard).toBe("0.0.0.255");
    expect(i.firstHost).toBe("192.168.1.1");
    expect(i.lastHost).toBe("192.168.1.254");
    expect(i.totalHosts).toBe(256);
    expect(i.usableHosts).toBe(254);
    expect(i.isPrivate).toBe(true);
    expect(i.cidr).toBe("192.168.1.0/24");
  });

  it("handles /31 point-to-point links (RFC 3021)", () => {
    const i = describe("10.0.0.4/31");
    expect(i.firstHost).toBe("10.0.0.4");
    expect(i.lastHost).toBe("10.0.0.5");
    expect(i.usableHosts).toBe(2);
  });

  it("handles /32 host routes", () => {
    const i = describe("8.8.8.8/32");
    expect(i.network).toBe("8.8.8.8");
    expect(i.broadcast).toBe("8.8.8.8");
    expect(i.usableHosts).toBe(1);
    expect(i.isPrivate).toBe(false);
  });

  it("handles 0.0.0.0/0", () => {
    const i = describe("0.0.0.0/0");
    expect(i.netmask).toBe("0.0.0.0");
    expect(i.broadcast).toBe("255.255.255.255");
    expect(i.totalHosts).toBe(4294967296);
  });

  it("flags all RFC 1918 ranges and nothing else", () => {
    expect(describe("10.1.2.3/24").isPrivate).toBe(true);
    expect(describe("172.16.5.5/24").isPrivate).toBe(true);
    expect(describe("172.32.5.5/24").isPrivate).toBe(false);
    expect(describe("192.168.9.9/24").isPrivate).toBe(true);
    expect(describe("8.8.8.0/24").isPrivate).toBe(false);
  });
});

group("contains", () => {
  it("matches inside and rejects outside", () => {
    expect(contains("10.0.0.0/8", "10.255.1.1")).toBe(true);
    expect(contains("10.0.0.0/8", "11.0.0.1")).toBe(false);
    expect(contains("192.168.1.0/24", "192.168.1.0")).toBe(true);
    expect(contains("192.168.1.0/24", "192.168.2.1")).toBe(false);
  });
});

group("split", () => {
  it("splits a /22 into four /24s by count", () => {
    expect(split("10.0.0.0/22", { count: 4 })).toEqual([
      "10.0.0.0/24",
      "10.0.1.0/24",
      "10.0.2.0/24",
      "10.0.3.0/24",
    ]);
  });

  it("rounds a non-power-of-two count up", () => {
    expect(split("10.0.0.0/24", { count: 3 })).toHaveLength(4);
  });

  it("splits by explicit prefix", () => {
    expect(split("172.16.0.0/16", { newPrefix: 18 })).toEqual([
      "172.16.0.0/18",
      "172.16.64.0/18",
      "172.16.128.0/18",
      "172.16.192.0/18",
    ]);
  });

  it("normalises host bits before splitting", () => {
    expect(split("10.0.0.130/24", { newPrefix: 26 })[0]).toBe("10.0.0.0/26");
  });

  it("refuses to split into a larger block", () => {
    expect(() => split("10.0.0.0/24", { newPrefix: 20 })).toThrow();
  });
});
