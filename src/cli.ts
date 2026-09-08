import { describe, contains, split, type SubnetInfo } from "./ip.js";

const VERSION = "0.1.0";

const HELP = `subnetkit ${VERSION} — IPv4 subnet calculator

USAGE
  subnetkit <command> [args] [--json]

COMMANDS
  info <cidr>                 Show network, broadcast, mask, host range and count.
  split <cidr> --into <n>     Split into n equal blocks (rounded up to a power of 2).
  split <cidr> --prefix <p>   Split into /p blocks.
  contains <cidr> <ip>        Exit 0 if ip is inside cidr, 1 otherwise.

  <cidr> accepts "10.0.0.0/24", "10.0.0.0 255.255.255.0" or a bare "10.0.0.1" (/32).

OPTIONS
  --json        Emit machine-readable JSON instead of a table.
  -h, --help    Show this help.
  -v, --version Print the version.

EXAMPLES
  subnetkit info 192.168.1.10/24
  subnetkit split 10.0.0.0/22 --into 4
  subnetkit split 172.16.0.0/16 --prefix 20 --json
  subnetkit contains 10.0.0.0/8 10.4.5.6
`;

function fail(msg: string): never {
  process.stderr.write(`subnetkit: ${msg}\n`);
  process.exit(2);
}

function printInfoTable(info: SubnetInfo): void {
  const rows: [string, string][] = [
    ["Address", `${info.address}/${info.prefix}`],
    ["Network", info.cidr],
    ["Broadcast", info.broadcast],
    ["Netmask", info.netmask],
    ["Wildcard", info.wildcard],
    ["Host range", info.firstHost ? `${info.firstHost} – ${info.lastHost}` : "—"],
    ["Total addrs", String(info.totalHosts)],
    ["Usable hosts", String(info.usableHosts)],
    ["Type", info.isPrivate ? "private (RFC 1918)" : "public"],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    process.stdout.write(`${k.padEnd(width)}  ${v}\n`);
  }
}

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const val = args[i + 1];
  if (val == null) fail(`${name} needs a value`);
  return val;
}

function main(argv: string[]): void {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP);
    return;
  }
  if (args.includes("-v") || args.includes("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const json = args.includes("--json");
  const [command, ...rest] = args;
  const positional = rest.filter((a) => !a.startsWith("--"));

  try {
    switch (command) {
      case "info": {
        if (!positional[0]) fail("info needs a <cidr>");
        const info = describe(positional[0]);
        if (json) process.stdout.write(JSON.stringify(info, null, 2) + "\n");
        else printInfoTable(info);
        return;
      }
      case "split": {
        if (!positional[0]) fail("split needs a <cidr>");
        const into = getFlag(rest, "--into");
        const prefix = getFlag(rest, "--prefix");
        if (!into && !prefix) fail("split needs --into <n> or --prefix <p>");
        const blocks = split(positional[0], {
          count: into ? Number(into) : undefined,
          newPrefix: prefix ? Number(prefix) : undefined,
        });
        if (json) process.stdout.write(JSON.stringify(blocks, null, 2) + "\n");
        else process.stdout.write(blocks.join("\n") + "\n");
        return;
      }
      case "contains": {
        if (!positional[0] || !positional[1]) {
          fail("contains needs <cidr> <ip>");
        }
        const inside = contains(positional[0], positional[1]);
        if (json) {
          process.stdout.write(
            JSON.stringify({ cidr: positional[0], ip: positional[1], inside }) +
              "\n",
          );
        } else {
          process.stdout.write(
            `${positional[1]} is ${inside ? "inside" : "outside"} ${positional[0]}\n`,
          );
        }
        process.exit(inside ? 0 : 1);
      }
      default:
        fail(`unknown command "${command}" — try "subnetkit --help"`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main(process.argv);
