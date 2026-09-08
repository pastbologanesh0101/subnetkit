# subnetkit

[![CI](https://github.com/pastbologanesh0101/subnetkit/actions/workflows/ci.yml/badge.svg)](https://github.com/pastbologanesh0101/subnetkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)

A fast, **zero-runtime-dependency** IPv4 subnet calculator for the command line — and a
tiny typed library you can import. Written in TypeScript, all the address math is done
on unsigned 32-bit integers, so it stays correct right up to `255.255.255.255` and
`0.0.0.0/0`.

```
$ subnetkit info 192.168.1.10/24
Address       192.168.1.10/24
Network       192.168.1.0/24
Broadcast     192.168.1.255
Netmask       255.255.255.0
Wildcard      0.0.0.255
Host range    192.168.1.1 – 192.168.1.254
Total addrs   256
Usable hosts  254
Type          private (RFC 1918)
```

## Why

I kept reaching for a browser subnet calculator during my networking coursework and
labs. This does the same job without leaving the terminal, scripts cleanly with
`--json`, and handles the awkward edges most quick calculators get wrong: `/31`
point-to-point links (RFC 3021), `/32` host routes, and the default route `0.0.0.0/0`.

## Getting started

Requires Node.js 18+.

```bash
git clone https://github.com/pastbologanesh0101/subnetkit.git
cd subnetkit
npm install
npm run build
npm link          # puts `subnetkit` on your PATH

# or run without linking:
node dist/cli.js info 10.0.0.0/24
```

## Usage

```
subnetkit <command> [args] [--json]

info <cidr>                 Show network, broadcast, mask, host range and count.
split <cidr> --into <n>     Split into n equal blocks (rounded up to a power of 2).
split <cidr> --prefix <p>   Split into /p blocks.
contains <cidr> <ip>        Exit 0 if ip is inside cidr, 1 otherwise.
```

`<cidr>` accepts three forms:

| Form                          | Example                        |
| ----------------------------- | ------------------------------ |
| slash notation                | `10.0.0.0/24`                  |
| address + dotted mask         | `10.0.0.0 255.255.255.0`       |
| bare address (implies `/32`)  | `10.0.0.1`                     |

### Split a block

```
$ subnetkit split 10.0.0.0/22 --into 4
10.0.0.0/24
10.0.1.0/24
10.0.2.0/24
10.0.3.0/24
```

### Test membership (scriptable)

```bash
if subnetkit contains 10.0.0.0/8 "$CLIENT_IP"; then
  echo "internal client"
fi
```

### JSON output

```
$ subnetkit info 8.8.8.8/32 --json
{
  "address": "8.8.8.8",
  "prefix": 32,
  "network": "8.8.8.8",
  "broadcast": "8.8.8.8",
  "netmask": "255.255.255.255",
  "wildcard": "0.0.0.0",
  "firstHost": "8.8.8.8",
  "lastHost": "8.8.8.8",
  "totalHosts": 1,
  "usableHosts": 1,
  "isPrivate": false,
  "cidr": "8.8.8.8/32"
}
```

## Library API

```ts
import { describe, contains, split } from "subnetkit";

describe("172.16.0.0/16").usableHosts;          // 65534
contains("10.0.0.0/8", "10.9.8.7");             // true
split("10.0.0.0/24", { newPrefix: 26 });        // ["10.0.0.0/26", ...]
```

| Export                       | Purpose                                              |
| ---------------------------- | --------------------------------------------------- |
| `describe(cidr)`             | Full `SubnetInfo` record for a block.               |
| `contains(cidr, ip)`         | Membership test.                                    |
| `split(cidr, opts)`          | Divide into equal children by `count` or `newPrefix`. |
| `ipToInt` / `intToIp`        | Dotted-decimal ⇄ uint32.                            |
| `prefixToMask` / `maskToPrefix` | Prefix length ⇄ mask (rejects non-contiguous masks). |
| `parseCidr(input)`           | `[ipInt, prefix]` from any accepted form.           |

## How it works

An IPv4 address is just a 32-bit number. `ipToInt` folds the four octets in with
`(acc << 8) | octet` and a final `>>> 0` to read it back as unsigned. From there:

- **network** = `address & mask`
- **broadcast** = `network | ~mask`
- **mask** for prefix `p` = `0xffffffff << (32 - p)`

`split` walks from the base network in steps of `2 ** (32 - newPrefix)`. Everything is
integer arithmetic, so there is no precision loss and no dependency on a bignum library.

## Development

```bash
npm test          # vitest, run once
npm run test:watch
npm run typecheck  # tsc --noEmit, strict
npm run build      # tsup -> dist/ (ESM + d.ts)
```

CI runs the type-check, tests, and build on Node 18, 20 and 22.

## Roadmap

- IPv6 support (`describe`, `contains`, `split`)
- VLSM allocation: fit a list of host requirements into a parent block
- Publish to npm for `npx subnetkit`

## License

MIT © pastbologanesh0101
