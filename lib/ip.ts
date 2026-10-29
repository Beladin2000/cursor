export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

export function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function dottedMask(prefix: number): string {
  const mask = maskFromPrefix(prefix);
  return [24, 16, 8, 0].map((shift) => (mask >>> shift) & 255).join(".");
}

export function networkAddress(ip: string, prefix: number): string | null {
  const value = ipv4ToInt(ip);
  if (value === null || prefix < 0 || prefix > 32) return null;
  const network = (value & maskFromPrefix(prefix)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join(".");
}

export function prefixContains(cidr: string, ip: string): boolean {
  const [net, lengthText] = cidr.split("/");
  const length = Number(lengthText);
  if (!Number.isInteger(length) || length < 0 || length > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net);
  if (ipInt === null || netInt === null) return false;
  const mask = maskFromPrefix(length);
  return (ipInt & mask) === (netInt & mask);
}

export function prefixLength(cidr: string): number {
  const length = Number(cidr.split("/")[1]);
  return Number.isInteger(length) ? length : -1;
}

export function normalizeMac(input: string): string | null {
  const raw = input.trim().toLowerCase();
  const colon = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/;
  const dash = /^[0-9a-f]{2}(?:-[0-9a-f]{2}){5}$/;
  const cisco = /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/;
  const bare = /^[0-9a-f]{12}$/;
  if (!colon.test(raw) && !dash.test(raw) && !cisco.test(raw) && !bare.test(raw)) {
    return null;
  }
  const hex = raw.replace(/[^0-9a-f]/g, "");
  return hex.match(/.{2}/g)!.join(":");
}

export function isIpv4(value: string): boolean {
  return ipv4ToInt(value) !== null;
}

export function reverseDnsName(ip: string): string {
  return `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
}

export function containsToken(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`,
    "i",
  );
  return pattern.test(haystack);
}

export function formatRegina(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Regina",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return `${formatted} Regina`;
}

export function ouiVendor(mac: string): string {
  const normalized = normalizeMac(mac) ?? mac.toLowerCase();
  if (normalized.startsWith("00:00:0c")) return "Cisco Systems";
  if (
    normalized.startsWith("02:") ||
    normalized.startsWith("06:") ||
    normalized.startsWith("0a:") ||
    normalized.startsWith("0e:")
  ) {
    return "Locally administered";
  }
  return "Not in the SWAN OUI cache";
}

export const PRODUCTION_INDEX = {
  label: "Latest indexed build",
  devices: 1270,
  configRecords: 1_300_053,
  searchChunks: 131,
  arp: 16_643,
  mac: 307_680,
  ipCorrelations: 10_534,
  macCorrelations: 16_887,
  deviceCorrelations: 962,
  operationalDevices: 1_129,
  routes: 5644,
  policies: 47_209,
  evidenceIps: 14_339,
  evidenceDevices: 1_269,
  evidenceVlans: 1_319,
};

export const INDEXED_SOURCES = [
  {
    id: "configs_swan",
    name: "configs_swan",
    repo: "gitlab.stholdco.com/gestalt/configs_swan.git",
    detail:
      "Running configuration: device identity, interfaces, VLANs, SVIs, static and dynamic routes, ACLs and security policy, F5, and configuration references.",
  },
  {
    id: "show_swan_facts",
    name: "show_swan_facts",
    repo: "gitlab.stholdco.com/swan/show_swan_facts.git",
    detail:
      "Operational output. ARP is show_ip_arp_all/Show_IP_ARP_All-YYYYMMDD.csv. MAC tables are show_mac_address_table_all/Show_MAC_ADDRESS_TABLE_All-YYYYMMDD.csv.",
  },
  {
    id: "correlation",
    name: "Correlation index",
    repo: "AIconfig-search/public/data/",
    detail:
      "SWAN joins the two repositories into manifest.json, device-summaries, arp-index, mac-index, correlation-index, operational-index, evidence-index, and chunk-0000 through chunk-0130.",
  },
] as const;

export const LIVE_SOURCES = [
  {
    id: "netbox",
    name: "NetBox",
    detail: "IP, prefix, VRF, and the rest of the IPAM context. Called when an investigation needs source-of-truth context.",
  },
  {
    id: "dns",
    name: "DNS lookup",
    detail: "Reverse an IP to a hostname, and forward a hostname to an IP.",
  },
  {
    id: "cpnr",
    name: "CPNR",
    detail: "The DNS records held in CPNR, separate from what a resolver returns.",
  },
  {
    id: "nnmi",
    name: "NNMi",
    detail: "Related alarms. Once the device is known, this is whether monitoring also sees a problem.",
  },
  {
    id: "na",
    name: "Network Automation",
    detail: "Configuration changes: what changed, when, on which device, and what was different.",
  },
] as const;
