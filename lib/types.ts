export type Vendor = "Cisco" | "Palo Alto";

export type DeviceRole =
  | "core"
  | "distribution"
  | "access"
  | "management"
  | "firewall"
  | "wan"
  | "wireless"
  | "dc";

export type OperStatus = "up" | "down";

export interface Device {
  id: string;
  hostname: string;
  vendor: Vendor;
  platform: string;
  os: string;
  osVersion: string;
  role: DeviceRole;
  region: string;
  site: string;
  siteName: string;
  building: string;
  rack: string;
  mgmtIp: string;
  mac: string;
  status: "up" | "degraded" | "down";
  serial: string;
  lastBackup: string;
}

export type InterfaceMode = "access" | "trunk" | "routed" | "svi" | "loopback";

export interface NetInterface {
  id: string;
  deviceId: string;
  name: string;
  description: string;
  adminStatus: OperStatus;
  operStatus: OperStatus;
  mode: InterfaceMode;
  accessVlan?: number;
  nativeVlan?: number;
  allowedVlans?: number[];
  vlanId?: number;
  ip?: string;
  prefix?: number;
  standbyIp?: string;
  neighborDeviceId?: string;
  neighborInterface?: string;
}

export interface VlanDef {
  deviceId: string;
  vlanId: number;
  name: string;
}

export interface ArpEntry {
  deviceId: string;
  ip: string;
  mac: string;
  interface: string;
  vrf: string;
  age: string;
  protocol: string;
}

export interface MacEntry {
  deviceId: string;
  mac: string;
  vlan: number;
  interface: string;
  type: "dynamic" | "static";
}

export type RouteProtocol = "connected" | "static" | "ospf" | "bgp";

export interface RouteEntry {
  deviceId: string;
  prefix: string;
  protocol: RouteProtocol;
  nextHop: string;
  interface?: string;
  metric?: number;
  vrf: string;
}

export interface Policy {
  id: string;
  deviceId: string;
  name: string;
  kind: "acl" | "security-rule" | "prefix-list" | "address-object";
  action: string;
  summary: string;
  matches: string[];
  text: string;
}

export interface ConfigDoc {
  deviceId: string;
  capturedAt: string;
  lines: string[];
}

export interface NetBoxIp {
  address: string;
  status: "active" | "reserved" | "deprecated" | "dhcp";
  dnsName?: string;
  description: string;
  tenant: string;
  role: string;
  assignedTo: string;
  prefix: string;
  prefixDescription: string;
  vlanId?: number;
  vrf: string;
  site: string;
}

export interface NetBoxPrefix {
  prefix: string;
  description: string;
  site: string;
  vlanId?: number;
  vrf: string;
  role: string;
  status: "active" | "reserved";
}

export interface NetBoxDevice {
  hostname: string;
  role: string;
  platform: string;
  site: string;
  status: string;
  primaryIp: string;
  serial: string;
  rack: string;
  region: string;
}

export interface DnsRecord {
  name: string;
  type: "A" | "PTR";
  value: string;
  zone: string;
  system: "cpnr";
}

export interface DnsLookup {
  direction: "forward" | "reverse";
  query: string;
  answer: string;
  agreesWithCpnr: boolean;
}

export type Severity = "critical" | "major" | "minor" | "warning" | "info";

export interface Alarm {
  id: string;
  severity: Severity;
  node: string;
  deviceId: string;
  interface?: string;
  summary: string;
  detail: string;
  time: string;
  state: "open" | "acknowledged";
  vlanIds?: number[];
  ips?: string[];
  macs?: string[];
}

export interface ChangeRecord {
  id: string;
  deviceId: string;
  time: string;
  user: string;
  summary: string;
  diff: string;
}

export interface Corpus {
  devices: Device[];
  interfaces: NetInterface[];
  vlans: VlanDef[];
  arp: ArpEntry[];
  macs: MacEntry[];
  routes: RouteEntry[];
  policies: Policy[];
  configs: ConfigDoc[];
  netboxIps: NetBoxIp[];
  netboxPrefixes: NetBoxPrefix[];
  netboxDevices: NetBoxDevice[];
  dns: DnsRecord[];
  alarms: Alarm[];
  changes: ChangeRecord[];
  capturedAt: string;
}

export type AnomalyCode =
  | "native-vlan-mismatch"
  | "allowed-vlan-mismatch"
  | "mac-on-multiple-access-ports"
  | "dns-mismatch"
  | "netbox-arp-gap"
  | "policy-without-arp"
  | "svi-asymmetric";

export interface Anomaly {
  id: string;
  code: AnomalyCode;
  severity: Severity;
  title: string;
  detail: string;
  query: string;
  vlanIds: number[];
  ips: string[];
  macs: string[];
  deviceIds: string[];
}

export interface ChainNode {
  id: string;
  kind: string;
  label: string;
  detail: string;
  query?: string;
  tone: "neutral" | "ok" | "attention";
}

export interface SourceCheck {
  id: string;
  label: string;
  tier: "indexed" | "live";
  system: string;
  state: "hit" | "clear";
  detail: string;
}

export interface Dossier {
  query: string;
  queryType: "device" | "ip" | "prefix" | "mac" | "vlan";
  title: string;
  subtitle: string;
  badges: { label: string; tone: "ok" | "attention" | "neutral" | "info" }[];
  chain: ChainNode[];
  devices: { device: Device; reasons: string[] }[];
  interfaces: { hostname: string; iface: NetInterface; note: string }[];
  vlans: {
    vlanId: number;
    name: string;
    devices: string[];
    accessCount: number;
    trunkCount: number;
    sviCount: number;
    nativeCount: number;
  }[];
  arp: { hostname: string; entry: ArpEntry }[];
  macs: { hostname: string; entry: MacEntry; mode: string; description: string }[];
  routes: { hostname: string; route: RouteEntry; longest: boolean }[];
  policies: { hostname: string; policy: Policy; exact: boolean }[];
  configDevices: { device: Device; lines: string[] }[];
  configHits: {
    hostname: string;
    deviceId: string;
    line: number;
    text: string;
    elsewhere: boolean;
  }[];
  netbox: { title: string; rows: { label: string; value: string }[] }[];
  dns: { record: DnsRecord; conflict: boolean }[];
  lookups: DnsLookup[];
  alarms: Alarm[];
  changes: { hostname: string; change: ChangeRecord }[];
  anomalies: Anomaly[];
  sources: SourceCheck[];
  highlightTokens: string[];
}

export type Investigation =
  | { kind: "empty" }
  | { kind: "short"; query: string }
  | {
      kind: "choose-device";
      query: string;
      devices: Device[];
      configHits: number;
    }
  | {
      kind: "config-search";
      query: string;
      total: number;
      truncated: boolean;
      groups: { device: Device; hits: { line: number; text: string }[] }[];
    }
  | { kind: "dossier"; dossier: Dossier };

export interface Suggestion {
  label: string;
  detail: string;
  query: string;
  type: string;
}

export interface MatrixRow {
  vlanId: number;
  names: string[];
  sites: string[];
  devices: string[];
  accessCount: number;
  trunkCount: number;
  nativeCount: number;
  sviCount: number;
  sviDown: number;
  anomalyCount: number;
  anomalyTitles: string[];
}

export interface SliceStats {
  devices: number;
  configRecords: number;
  arp: number;
  mac: number;
  correlatedIps: number;
  correlatedMacs: number;
  routes: number;
  policies: number;
}

export interface Summary {
  headline: string;
  paragraphs: string[];
  leading: { severity: Severity; text: string }[];
  healthy: string[];
  checks: string[];
  packet: string;
}
