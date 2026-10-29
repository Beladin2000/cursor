import { dottedMask, networkAddress, prefixContains } from "../ip";
import type {
  Alarm,
  ArpEntry,
  ChangeRecord,
  ConfigDoc,
  Corpus,
  Device,
  DnsRecord,
  MacEntry,
  NetBoxIp,
  NetBoxPrefix,
  NetInterface,
  Policy,
  RouteEntry,
  VlanDef,
} from "../types";

const CAPTURED_AT = "2026-10-28T22:40:00-06:00";

const VLANS_4C = [10, 20, 100, 120, 200, 240, 250, 400, 999];
const VLAN_NAME: Record<number, string> = {
  5: "NTP",
  10: "MGMT",
  11: "MGMT-2A",
  20: "SERVER-OOB",
  100: "USERS-4C-E",
  110: "USERS-2A",
  120: "USERS-4C-W",
  160: "SERVERS-DC",
  200: "VOICE",
  240: "BADGE-ACCESS",
  250: "WLAN-CORP",
  400: "PRINT",
  999: "NATIVE",
};

function device(partial: Device): Device {
  return partial;
}

const devices: Device[] = [
  device({
    id: "core1",
    hostname: "ASR1001-REGN10-CORE-1",
    vendor: "Cisco",
    platform: "ASR1001-X",
    os: "IOS-XE",
    osVersion: "17.12.2",
    role: "core",
    region: "REGN10",
    site: "REGN10-CORE",
    siteName: "Region 10 · Core",
    building: "Core",
    rack: "CORE-R1",
    mgmtIp: "10.40.255.1",
    mac: "00:00:0c:00:10:01",
    status: "up",
    serial: "FOX2410C001",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "core2",
    hostname: "ASR1001-REGN10-CORE-2",
    vendor: "Cisco",
    platform: "ASR1001-X",
    os: "IOS-XE",
    osVersion: "17.12.2",
    role: "core",
    region: "REGN10",
    site: "REGN10-CORE",
    siteName: "Region 10 · Core",
    building: "Core",
    rack: "CORE-R1",
    mgmtIp: "10.40.255.2",
    mac: "00:00:0c:00:10:02",
    status: "up",
    serial: "FOX2410C002",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "dist1",
    hostname: "C9500-REGN10-4C-DIST-1",
    vendor: "Cisco",
    platform: "C9500-24Y4C",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "distribution",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-MDF-R1",
    mgmtIp: "10.40.8.2",
    mac: "00:00:0c:40:08:02",
    status: "up",
    serial: "FOX24104D01",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "dist2",
    hostname: "C9500-REGN10-4C-DIST-2",
    vendor: "Cisco",
    platform: "C9500-24Y4C",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "distribution",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-MDF-R2",
    mgmtIp: "10.40.8.3",
    mac: "00:00:0c:40:08:03",
    status: "up",
    serial: "FOX24104D02",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "mgt1",
    hostname: "C9300-REGN10-4C-MGT-1",
    vendor: "Cisco",
    platform: "C9300-24P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "management",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-MDF-R3",
    mgmtIp: "10.40.8.14",
    mac: "00:00:0c:40:08:14",
    status: "up",
    serial: "FOX24104M01",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc1",
    hostname: "C9300-REGN10-4C-ACC-1",
    vendor: "Cisco",
    platform: "C9300-48P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-E-IDF-1",
    mgmtIp: "10.40.8.21",
    mac: "00:00:0c:40:08:21",
    status: "up",
    serial: "FOX24104A01",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc2",
    hostname: "C9300-REGN10-4C-ACC-2",
    vendor: "Cisco",
    platform: "C9300-48P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-E-IDF-2",
    mgmtIp: "10.40.8.22",
    mac: "00:00:0c:40:08:22",
    status: "up",
    serial: "FOX24104A02",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc3",
    hostname: "C9300-REGN10-4C-ACC-3",
    vendor: "Cisco",
    platform: "C9300-48P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-E-IDF-3",
    mgmtIp: "10.40.8.23",
    mac: "00:00:0c:40:08:23",
    status: "degraded",
    serial: "FOX24104A03",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc4",
    hostname: "C9300-REGN10-4C-ACC-4",
    vendor: "Cisco",
    platform: "C9300-48P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-W-IDF-1",
    mgmtIp: "10.40.8.24",
    mac: "00:00:0c:40:08:24",
    status: "up",
    serial: "FOX24104A04",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc5",
    hostname: "C9300-REGN10-4C-ACC-5",
    vendor: "Cisco",
    platform: "C9300-24P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-LOBBY",
    mgmtIp: "10.40.8.25",
    mac: "00:00:0c:40:08:25",
    status: "up",
    serial: "FOX24104A05",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc6",
    hostname: "C9200-REGN10-4C-ACC-6",
    vendor: "Cisco",
    platform: "C9200-24P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-W-IDF-2",
    mgmtIp: "10.40.8.26",
    mac: "00:00:0c:40:08:26",
    status: "degraded",
    serial: "FOX24104A06",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc7",
    hostname: "C9300-REGN10-4C-ACC-7",
    vendor: "Cisco",
    platform: "C9300-48U",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-N-IDF-1",
    mgmtIp: "10.40.8.27",
    mac: "00:00:0c:40:08:27",
    status: "up",
    serial: "FOX24104A07",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "wlc1",
    hostname: "C9800-REGN10-4C-WLC-1",
    vendor: "Cisco",
    platform: "C9800-40",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "wireless",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-MDF-R4",
    mgmtIp: "10.40.8.30",
    mac: "00:00:0c:40:08:30",
    status: "up",
    serial: "FOX24104W01",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "fw1",
    hostname: "PA-REGN10-4C-FW-1",
    vendor: "Palo Alto",
    platform: "PA-3220",
    os: "PAN-OS",
    osVersion: "11.1.4",
    role: "firewall",
    region: "REGN10",
    site: "REGN10-4C",
    siteName: "Region 10 · Building 4C",
    building: "4C",
    rack: "4C-MDF-R5",
    mgmtIp: "10.40.8.40",
    mac: "02:1b:17:00:00:40",
    status: "up",
    serial: "PA24104001",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "wan1",
    hostname: "ISR4451-REGN10-WAN-1",
    vendor: "Cisco",
    platform: "ISR4451",
    os: "IOS-XE",
    osVersion: "17.12.2",
    role: "wan",
    region: "REGN10",
    site: "REGN10-CORE",
    siteName: "Region 10 · Core",
    building: "Core",
    rack: "CORE-R2",
    mgmtIp: "10.40.8.6",
    mac: "00:00:0c:44:51:06",
    status: "degraded",
    serial: "FOX2410W001",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "dist2a",
    hostname: "C9500-REGN10-2A-DIST-1",
    vendor: "Cisco",
    platform: "C9500-24Y4C",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "distribution",
    region: "REGN10",
    site: "REGN10-2A",
    siteName: "Region 10 · Building 2A",
    building: "2A",
    rack: "2A-MDF-R1",
    mgmtIp: "10.40.9.1",
    mac: "00:00:0c:40:09:01",
    status: "up",
    serial: "FOX24102D01",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc2a",
    hostname: "C9300-REGN10-2A-ACC-1",
    vendor: "Cisco",
    platform: "C9300-48P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN10",
    site: "REGN10-2A",
    siteName: "Region 10 · Building 2A",
    building: "2A",
    rack: "2A-IDF-1",
    mgmtIp: "10.40.9.21",
    mac: "00:00:0c:40:09:21",
    status: "up",
    serial: "FOX24102A01",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "core7",
    hostname: "ASR1001-REGN07-CORE-1",
    vendor: "Cisco",
    platform: "ASR1001-X",
    os: "IOS-XE",
    osVersion: "17.12.2",
    role: "core",
    region: "REGN07",
    site: "REGN07-CORE",
    siteName: "Region 07 · Core",
    building: "Core",
    rack: "R7-CORE-R1",
    mgmtIp: "10.70.255.1",
    mac: "00:00:0c:00:70:01",
    status: "up",
    serial: "FOX2407C001",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "acc7a",
    hostname: "C9300-REGN07-1A-ACC-1",
    vendor: "Cisco",
    platform: "C9300-48P",
    os: "IOS-XE",
    osVersion: "17.12.4",
    role: "access",
    region: "REGN07",
    site: "REGN07-1A",
    siteName: "Region 07 · Building 1A",
    building: "1A",
    rack: "1A-IDF-1",
    mgmtIp: "10.70.8.21",
    mac: "00:00:0c:70:08:21",
    status: "up",
    serial: "FOX2407A001",
    lastBackup: CAPTURED_AT,
  }),
  device({
    id: "dc1",
    hostname: "NX93180-REGN10-DC-1",
    vendor: "Cisco",
    platform: "N9K-C93180YC-FX",
    os: "NX-OS",
    osVersion: "10.4(3)",
    role: "dc",
    region: "REGN10",
    site: "REGN10-DC",
    siteName: "Region 10 · Data Center",
    building: "DC",
    rack: "DC-R12",
    mgmtIp: "10.40.16.1",
    mac: "00:00:0c:40:16:02",
    status: "up",
    serial: "FOX2410N001",
    lastBackup: CAPTURED_AT,
  }),
];

const byId = new Map(devices.map((item) => [item.id, item]));

function nameOf(id: string): string {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown device ${id}`);
  return found.hostname;
}

const interfaces: NetInterface[] = [];
const vlans: VlanDef[] = [];
const arp: ArpEntry[] = [];
const macs: MacEntry[] = [];
const routes: RouteEntry[] = [];
const policies: Policy[] = [];

function addVlans(deviceId: string, ids: number[], names?: Record<number, string>) {
  for (const vlanId of ids) {
    vlans.push({
      deviceId,
      vlanId,
      name: names?.[vlanId] ?? VLAN_NAME[vlanId] ?? `VLAN${vlanId}`,
    });
  }
}

function addInterface(partial: NetInterface) {
  interfaces.push(partial);
}

function addTrunk(
  a: { deviceId: string; name: string; native: number; allowed: number[] },
  b: { deviceId: string; name: string; native: number; allowed: number[] },
) {
  const ends = [a, b];
  for (let index = 0; index < 2; index += 1) {
    const self = ends[index];
    const peer = ends[1 - index];
    addInterface({
      id: `${self.deviceId}:${self.name}`,
      deviceId: self.deviceId,
      name: self.name,
      description: `to ${nameOf(peer.deviceId)} ${peer.name}`,
      adminStatus: "up",
      operStatus: "up",
      mode: "trunk",
      nativeVlan: self.native,
      allowedVlans: self.allowed,
      neighborDeviceId: peer.deviceId,
      neighborInterface: peer.name,
    });
  }
}

function addRouted(
  a: { deviceId: string; name: string; ip: string; prefix: number },
  b: { deviceId: string; name: string; ip: string; prefix: number },
) {
  const ends = [a, b];
  for (let index = 0; index < 2; index += 1) {
    const self = ends[index];
    const peer = ends[1 - index];
    addInterface({
      id: `${self.deviceId}:${self.name}`,
      deviceId: self.deviceId,
      name: self.name,
      description: `to ${nameOf(peer.deviceId)} ${peer.name}`,
      adminStatus: "up",
      operStatus: "up",
      mode: "routed",
      ip: self.ip,
      prefix: self.prefix,
      neighborDeviceId: peer.deviceId,
      neighborInterface: peer.name,
    });
  }
}

function addSvi(
  deviceId: string,
  vlanId: number,
  ip: string,
  prefix: number,
  options?: { standby?: string; shutdown?: boolean; description?: string },
) {
  addInterface({
    id: `${deviceId}:Vlan${vlanId}`,
    deviceId,
    name: `Vlan${vlanId}`,
    description: options?.description ?? VLAN_NAME[vlanId] ?? `VLAN ${vlanId}`,
    adminStatus: options?.shutdown ? "down" : "up",
    operStatus: options?.shutdown ? "down" : "up",
    mode: "svi",
    vlanId,
    ip,
    prefix,
    standbyIp: options?.standby,
  });
}

function addAccess(
  deviceId: string,
  name: string,
  vlanId: number,
  description: string,
  shutdown = false,
) {
  addInterface({
    id: `${deviceId}:${name}`,
    deviceId,
    name,
    description,
    adminStatus: shutdown ? "down" : "up",
    operStatus: shutdown ? "down" : "up",
    mode: "access",
    accessVlan: vlanId,
    vlanId,
  });
}

function addLoopback(deviceId: string, ip: string) {
  addInterface({
    id: `${deviceId}:Loopback0`,
    deviceId,
    name: "Loopback0",
    description: "router-id",
    adminStatus: "up",
    operStatus: "up",
    mode: "loopback",
    ip,
    prefix: 32,
  });
}

function addRoute(
  deviceId: string,
  prefix: string,
  protocol: RouteEntry["protocol"],
  nextHop: string,
  iface?: string,
  metric?: number,
) {
  routes.push({
    deviceId,
    prefix,
    protocol,
    nextHop,
    interface: iface,
    metric,
    vrf: "default",
  });
}

const macSeen = new Set<string>();
const arpSeen = new Set<string>();

function addMac(
  deviceId: string,
  mac: string,
  vlan: number,
  iface: string,
  type: MacEntry["type"],
) {
  const key = `${deviceId}|${iface}|${mac}|${vlan}`;
  if (macSeen.has(key)) return;
  macSeen.add(key);
  macs.push({ deviceId, mac, vlan, interface: iface, type });
}

function addArp(deviceId: string, ip: string, mac: string, vlan: number) {
  const key = `${deviceId}|${ip}|${mac}`;
  if (arpSeen.has(key)) return;
  arpSeen.add(key);
  arp.push({
    deviceId,
    ip,
    mac,
    interface: `Vlan${vlan}`,
    vrf: "default",
    age: "00:03:12",
  });
}

function trunkAllows(iface: NetInterface, vlanId: number): boolean {
  if (iface.mode !== "trunk" || iface.operStatus !== "up") return false;
  if (!iface.allowedVlans || iface.allowedVlans.length === 0) return true;
  return iface.allowedVlans.includes(vlanId);
}

function learnOnTrunks(deviceId: string, mac: string, vlanId: number) {
  for (const iface of interfaces) {
    if (iface.deviceId !== deviceId || !trunkAllows(iface, vlanId)) continue;
    addMac(deviceId, mac, vlanId, iface.name, "dynamic");
    if (iface.neighborDeviceId && iface.neighborInterface) {
      addMac(iface.neighborDeviceId, mac, vlanId, iface.neighborInterface, "dynamic");
    }
  }
}

function addAccessEndpoint(endpoint: {
  mac: string;
  ip: string;
  vlan: number;
  deviceId: string;
  iface: string;
  arpOn: string[];
}) {
  addMac(endpoint.deviceId, endpoint.mac, endpoint.vlan, endpoint.iface, "dynamic");
  learnOnTrunks(endpoint.deviceId, endpoint.mac, endpoint.vlan);
  for (const deviceId of endpoint.arpOn) {
    addArp(deviceId, endpoint.ip, endpoint.mac, endpoint.vlan);
  }
}

function sharesSubnet(ip: string, prefix: number, deviceId: string): boolean {
  const network = networkAddress(ip, prefix);
  if (!network) return false;
  const cidr = `${network}/${prefix}`;
  return interfaces.some(
    (iface) =>
      iface.deviceId === deviceId &&
      iface.ip &&
      iface.prefix !== undefined &&
      iface.adminStatus === "up" &&
      prefixContains(`${networkAddress(iface.ip, iface.prefix)}/${iface.prefix}`, ip) &&
      prefixContains(cidr, iface.ip),
  );
}

addLoopback("core1", "10.40.255.1");
addLoopback("core2", "10.40.255.2");
addLoopback("core7", "10.70.255.1");

addRouted(
  { deviceId: "core1", name: "GigabitEthernet0/0/0", ip: "10.40.0.1", prefix: 30 },
  { deviceId: "dist1", name: "TenGigabitEthernet1/0/1", ip: "10.40.0.2", prefix: 30 },
);
addRouted(
  { deviceId: "core1", name: "GigabitEthernet0/0/1", ip: "10.40.0.5", prefix: 30 },
  { deviceId: "dist2", name: "TenGigabitEthernet1/0/1", ip: "10.40.0.6", prefix: 30 },
);
addRouted(
  { deviceId: "core2", name: "GigabitEthernet0/0/0", ip: "10.40.0.9", prefix: 30 },
  { deviceId: "dist1", name: "TenGigabitEthernet1/0/2", ip: "10.40.0.10", prefix: 30 },
);
addRouted(
  { deviceId: "core2", name: "GigabitEthernet0/0/1", ip: "10.40.0.13", prefix: 30 },
  { deviceId: "dist2", name: "TenGigabitEthernet1/0/2", ip: "10.40.0.14", prefix: 30 },
);
addRouted(
  { deviceId: "core1", name: "GigabitEthernet0/0/2", ip: "10.40.0.17", prefix: 30 },
  { deviceId: "fw1", name: "ethernet1/1", ip: "10.40.0.18", prefix: 30 },
);
addRouted(
  { deviceId: "core1", name: "GigabitEthernet0/0/3", ip: "10.40.0.21", prefix: 30 },
  { deviceId: "wan1", name: "GigabitEthernet0/0/0", ip: "10.40.0.22", prefix: 30 },
);
addRouted(
  { deviceId: "core2", name: "GigabitEthernet0/0/2", ip: "10.40.0.25", prefix: 30 },
  { deviceId: "dist2a", name: "TenGigabitEthernet1/0/1", ip: "10.40.0.26", prefix: 30 },
);
addRouted(
  { deviceId: "core1", name: "GigabitEthernet0/0/4", ip: "10.40.0.33", prefix: 30 },
  { deviceId: "dc1", name: "Ethernet1/1", ip: "10.40.0.34", prefix: 30 },
);
addRouted(
  { deviceId: "core1", name: "GigabitEthernet0/0/5", ip: "10.40.0.37", prefix: 30 },
  { deviceId: "core2", name: "GigabitEthernet0/0/5", ip: "10.40.0.38", prefix: 30 },
);

addInterface({
  id: "wan1:GigabitEthernet0/0/1",
  deviceId: "wan1",
  name: "GigabitEthernet0/0/1",
  description: "CARRIER-HANDOFF",
  adminStatus: "up",
  operStatus: "up",
  mode: "routed",
  ip: "198.51.100.2",
  prefix: 30,
});
addInterface({
  id: "wan1:GigabitEthernet0",
  deviceId: "wan1",
  name: "GigabitEthernet0",
  description: "management via C9300-REGN10-4C-MGT-1 GigabitEthernet1/0/4",
  adminStatus: "up",
  operStatus: "up",
  mode: "routed",
  ip: "10.40.8.6",
  prefix: 24,
});
addInterface({
  id: "fw1:management",
  deviceId: "fw1",
  name: "management",
  description: "management via C9300-REGN10-4C-MGT-1 GigabitEthernet1/0/5",
  adminStatus: "up",
  operStatus: "up",
  mode: "routed",
  ip: "10.40.8.40",
  prefix: 24,
});
addInterface({
  id: "core7:GigabitEthernet0/0/0",
  deviceId: "core7",
  name: "GigabitEthernet0/0/0",
  description: "TRANSIT toward Region 10",
  adminStatus: "up",
  operStatus: "up",
  mode: "routed",
  ip: "172.16.0.2",
  prefix: 30,
});
addInterface({
  id: "core7:GigabitEthernet0/0/1",
  deviceId: "core7",
  name: "GigabitEthernet0/0/1",
  description: "Region 07 management LAN",
  adminStatus: "up",
  operStatus: "up",
  mode: "routed",
  ip: "10.70.8.1",
  prefix: 24,
});

const healthyAccess: { id: string; port: string; left: string; right: string }[] = [
  { id: "acc1", port: "TenGigabitEthernet1/0/11", left: "GigabitEthernet1/0/47", right: "GigabitEthernet1/0/48" },
  { id: "acc2", port: "TenGigabitEthernet1/0/12", left: "GigabitEthernet1/0/47", right: "GigabitEthernet1/0/48" },
  { id: "acc4", port: "TenGigabitEthernet1/0/14", left: "GigabitEthernet1/0/47", right: "GigabitEthernet1/0/48" },
  { id: "acc5", port: "TenGigabitEthernet1/0/15", left: "GigabitEthernet1/0/47", right: "GigabitEthernet1/0/48" },
  { id: "acc7", port: "TenGigabitEthernet1/0/17", left: "GigabitEthernet1/0/47", right: "GigabitEthernet1/0/48" },
];

for (const access of healthyAccess) {
  addTrunk(
    { deviceId: access.id, name: access.left, native: 999, allowed: VLANS_4C },
    { deviceId: "dist1", name: access.port, native: 999, allowed: VLANS_4C },
  );
  addTrunk(
    { deviceId: access.id, name: access.right, native: 999, allowed: VLANS_4C },
    { deviceId: "dist2", name: access.port, native: 999, allowed: VLANS_4C },
  );
}

addTrunk(
  { deviceId: "acc3", name: "GigabitEthernet1/0/47", native: 240, allowed: [10, 20, 100, 120, 200, 240, 250] },
  { deviceId: "dist1", name: "TenGigabitEthernet1/0/13", native: 999, allowed: VLANS_4C },
);
addTrunk(
  { deviceId: "acc3", name: "GigabitEthernet1/0/48", native: 999, allowed: VLANS_4C },
  { deviceId: "dist2", name: "TenGigabitEthernet1/0/13", native: 999, allowed: VLANS_4C },
);

const mgtAllowed = [10, 20, 999];
addTrunk(
  { deviceId: "mgt1", name: "GigabitEthernet1/0/23", native: 999, allowed: mgtAllowed },
  { deviceId: "dist1", name: "TenGigabitEthernet1/0/18", native: 999, allowed: mgtAllowed },
);
addTrunk(
  { deviceId: "mgt1", name: "GigabitEthernet1/0/24", native: 999, allowed: mgtAllowed },
  { deviceId: "dist2", name: "TenGigabitEthernet1/0/18", native: 999, allowed: mgtAllowed },
);

addTrunk(
  { deviceId: "acc6", name: "GigabitEthernet1/0/23", native: 999, allowed: VLANS_4C },
  { deviceId: "dist1", name: "TenGigabitEthernet1/0/16", native: 999, allowed: VLANS_4C },
);
addTrunk(
  { deviceId: "acc6", name: "GigabitEthernet1/0/24", native: 999, allowed: VLANS_4C },
  { deviceId: "dist2", name: "TenGigabitEthernet1/0/16", native: 999, allowed: VLANS_4C },
);

const wlcAllowed = [10, 250, 999];
addTrunk(
  { deviceId: "wlc1", name: "TenGigabitEthernet0/0/0", native: 999, allowed: wlcAllowed },
  { deviceId: "dist1", name: "TenGigabitEthernet1/0/19", native: 999, allowed: wlcAllowed },
);
addTrunk(
  { deviceId: "wlc1", name: "TenGigabitEthernet0/0/1", native: 999, allowed: wlcAllowed },
  { deviceId: "dist2", name: "TenGigabitEthernet1/0/19", native: 999, allowed: wlcAllowed },
);

const vlan2a = [11, 110, 999];
addTrunk(
  { deviceId: "acc2a", name: "GigabitEthernet1/0/47", native: 999, allowed: vlan2a },
  { deviceId: "dist2a", name: "TenGigabitEthernet1/0/11", native: 999, allowed: vlan2a },
);

addInterface({
  id: "acc7a:GigabitEthernet1/0/47",
  deviceId: "acc7a",
  name: "GigabitEthernet1/0/47",
  description: "uplink toward ASR1001-REGN07-CORE-1",
  adminStatus: "up",
  operStatus: "up",
  mode: "trunk",
  nativeVlan: 999,
  allowedVlans: [10, 100, 999],
});

for (const id of ["dist1", "dist2", "acc1", "acc2", "acc3", "acc4", "acc5", "acc6", "acc7"]) {
  addVlans(id, VLANS_4C);
}
addVlans("mgt1", [10, 20, 999]);
addVlans("wlc1", [10, 250, 999]);
addVlans("dist2a", vlan2a);
addVlans("acc2a", vlan2a);
addVlans("acc7a", [10, 100, 999], { 10: "MGMT", 100: "USERS-7", 999: "NATIVE" });
addVlans("dc1", [5, 160]);

addSvi("dist1", 10, "10.40.8.2", 24, { standby: "10.40.8.1" });
addSvi("dist2", 10, "10.40.8.3", 24, { standby: "10.40.8.1" });
addSvi("dist1", 20, "10.40.20.2", 24, { standby: "10.40.20.1" });
addSvi("dist2", 20, "10.40.20.3", 24, { standby: "10.40.20.1" });
addSvi("dist1", 100, "10.40.100.2", 23, { standby: "10.40.100.1" });
addSvi("dist2", 100, "10.40.100.3", 23, { standby: "10.40.100.1" });
addSvi("dist1", 120, "10.40.120.2", 23, { standby: "10.40.120.1" });
addSvi("dist2", 120, "10.40.120.3", 23, { standby: "10.40.120.1" });
addSvi("dist1", 200, "10.40.200.2", 24, { standby: "10.40.200.1" });
addSvi("dist2", 200, "10.40.200.3", 24, { standby: "10.40.200.1" });
addSvi("dist1", 240, "10.40.24.2", 24, { standby: "10.40.24.1" });
addSvi("dist2", 240, "10.40.24.3", 24, { standby: "10.40.24.1" });
addSvi("dist1", 250, "10.40.250.2", 23, { standby: "10.40.250.1" });
addSvi("dist2", 250, "10.40.250.3", 23, { standby: "10.40.250.1" });
addSvi("dist1", 400, "10.40.40.2", 24, { standby: "10.40.40.1" });
addSvi("dist2", 400, "10.40.40.3", 24, { standby: "10.40.40.1", shutdown: true, description: "PRINT — shut for maintenance" });

for (const access of [
  ["mgt1", "10.40.8.14"],
  ["acc1", "10.40.8.21"],
  ["acc2", "10.40.8.22"],
  ["acc3", "10.40.8.23"],
  ["acc4", "10.40.8.24"],
  ["acc5", "10.40.8.25"],
  ["acc6", "10.40.8.26"],
  ["acc7", "10.40.8.27"],
  ["wlc1", "10.40.8.30"],
] as const) {
  addSvi(access[0], 10, access[1], 24);
}

addSvi("dist2a", 11, "10.40.9.1", 24);
addSvi("dist2a", 110, "10.40.110.1", 24);
addSvi("acc2a", 11, "10.40.9.21", 24);
addSvi("acc7a", 10, "10.70.8.21", 24);
addSvi("acc7a", 100, "10.70.100.1", 24, { description: "USERS-7" });
addSvi("dc1", 5, "10.40.1.1", 24, { description: "NTP" });
addSvi("dc1", 160, "10.40.16.1", 24, { description: "SERVERS-DC gateway and leaf management" });

addAccess("mgt1", "GigabitEthernet1/0/1", 20, "AUTH-SVR-4C 10.40.20.15");
addAccess("mgt1", "GigabitEthernet1/0/2", 20, "LOG-COLLECTOR 10.40.20.50");
addAccess("mgt1", "GigabitEthernet1/0/3", 20, "MAIL-RELAY 10.40.20.25");
addAccess("mgt1", "GigabitEthernet1/0/4", 10, "ISR4451-REGN10-WAN-1 management 10.40.8.6");
addAccess("mgt1", "GigabitEthernet1/0/5", 10, "PA-REGN10-4C-FW-1 management 10.40.8.40");
addAccess("mgt1", "GigabitEthernet1/0/6", 10, "CONSOLE-4C-1 10.40.8.50");

addAccess("acc1", "GigabitEthernet1/0/5", 100, "USER-4C-E-118 10.40.100.21");
addAccess("acc1", "GigabitEthernet1/0/6", 200, "PHONE-4C-E-118 10.40.200.12");
addAccess("acc1", "GigabitEthernet1/0/12", 240, "BADGE-4C-WEST 10.40.24.22");
addAccess("acc2", "GigabitEthernet1/0/6", 100, "USER-4C-E-206 10.40.100.34");
addAccess("acc2", "GigabitEthernet1/0/14", 100, "USER-4C-E-214 dock 10.40.100.50");
addAccess("acc2", "GigabitEthernet1/0/18", 240, "BADGE-4C-EAST-E12 10.40.24.46");
addAccess("acc4", "GigabitEthernet1/0/6", 120, "USER-4C-W-110 10.40.120.18");
addAccess("acc4", "GigabitEthernet1/0/9", 100, "USER-4C-W-SPARE 10.40.100.50");
addAccess("acc5", "GigabitEthernet1/0/4", 240, "BADGE-4C-LOBBY 10.40.24.47");
addAccess("acc5", "GigabitEthernet1/0/20", 400, "PRINTER-4C-E 10.40.40.15 not installed", true);
addAccess("acc6", "GigabitEthernet1/0/20", 250, "AP-4C-WEST-3", true);
addAccess("acc2a", "GigabitEthernet1/0/5", 110, "USER-2A-14 10.40.110.10");
addAccess("acc7a", "GigabitEthernet1/0/5", 100, "USER-7-1A-20 10.70.100.30");
addAccess("dc1", "Ethernet1/10", 5, "NTP-REGN10 10.40.1.5");
addAccess("dc1", "Ethernet1/20", 160, "APP-DC-12 10.40.16.20");

const distArp = ["dist1", "dist2"];

addAccessEndpoint({ mac: "02:40:24:12:44:8a", ip: "10.40.24.46", vlan: 240, deviceId: "acc2", iface: "GigabitEthernet1/0/18", arpOn: distArp });
addAccessEndpoint({ mac: "02:40:24:12:44:47", ip: "10.40.24.47", vlan: 240, deviceId: "acc5", iface: "GigabitEthernet1/0/4", arpOn: distArp });
addAccessEndpoint({ mac: "02:40:24:12:44:22", ip: "10.40.24.22", vlan: 240, deviceId: "acc1", iface: "GigabitEthernet1/0/12", arpOn: distArp });
addAccessEndpoint({ mac: "02:4c:10:00:02:19", ip: "10.40.100.50", vlan: 100, deviceId: "acc2", iface: "GigabitEthernet1/0/14", arpOn: distArp });
addAccessEndpoint({ mac: "02:4c:10:00:02:19", ip: "10.40.100.50", vlan: 100, deviceId: "acc4", iface: "GigabitEthernet1/0/9", arpOn: distArp });
addAccessEndpoint({ mac: "02:4c:10:00:01:21", ip: "10.40.100.21", vlan: 100, deviceId: "acc1", iface: "GigabitEthernet1/0/5", arpOn: distArp });
addAccessEndpoint({ mac: "02:4c:10:00:01:34", ip: "10.40.100.34", vlan: 100, deviceId: "acc2", iface: "GigabitEthernet1/0/6", arpOn: distArp });
addAccessEndpoint({ mac: "02:4c:12:00:01:18", ip: "10.40.120.18", vlan: 120, deviceId: "acc4", iface: "GigabitEthernet1/0/6", arpOn: distArp });
addAccessEndpoint({ mac: "02:40:20:0c:00:12", ip: "10.40.200.12", vlan: 200, deviceId: "acc1", iface: "GigabitEthernet1/0/6", arpOn: distArp });
addAccessEndpoint({ mac: "02:40:20:00:00:15", ip: "10.40.20.15", vlan: 20, deviceId: "mgt1", iface: "GigabitEthernet1/0/1", arpOn: distArp });
addAccessEndpoint({ mac: "02:40:20:00:00:50", ip: "10.40.20.50", vlan: 20, deviceId: "mgt1", iface: "GigabitEthernet1/0/2", arpOn: distArp });
addAccessEndpoint({ mac: "02:40:20:00:00:25", ip: "10.40.20.25", vlan: 20, deviceId: "mgt1", iface: "GigabitEthernet1/0/3", arpOn: distArp });
addAccessEndpoint({ mac: "02:40:08:00:00:50", ip: "10.40.8.50", vlan: 10, deviceId: "mgt1", iface: "GigabitEthernet1/0/6", arpOn: distArp });
addAccessEndpoint({ mac: byId.get("fw1")!.mac, ip: "10.40.8.40", vlan: 10, deviceId: "mgt1", iface: "GigabitEthernet1/0/5", arpOn: distArp });
addAccessEndpoint({ mac: byId.get("wan1")!.mac, ip: "10.40.8.6", vlan: 10, deviceId: "mgt1", iface: "GigabitEthernet1/0/4", arpOn: distArp });
addMac("fw1", byId.get("fw1")!.mac, 10, "management", "static");
addMac("wan1", byId.get("wan1")!.mac, 10, "GigabitEthernet0", "static");
addAccessEndpoint({ mac: "02:4c:11:00:00:10", ip: "10.40.110.10", vlan: 110, deviceId: "acc2a", iface: "GigabitEthernet1/0/5", arpOn: ["dist2a"] });
addAccessEndpoint({ mac: "02:70:10:00:00:30", ip: "10.70.100.30", vlan: 100, deviceId: "acc7a", iface: "GigabitEthernet1/0/5", arpOn: ["acc7a"] });
addAccessEndpoint({ mac: "02:40:01:00:00:05", ip: "10.40.1.5", vlan: 5, deviceId: "dc1", iface: "Ethernet1/10", arpOn: ["dc1"] });
addAccessEndpoint({ mac: "02:40:16:00:00:20", ip: "10.40.16.20", vlan: 160, deviceId: "dc1", iface: "Ethernet1/20", arpOn: ["dc1"] });

addMac("dist1", "02:40:25:00:00:40", 250, "TenGigabitEthernet1/0/19", "dynamic");
addMac("dist2", "02:40:25:00:00:40", 250, "TenGigabitEthernet1/0/19", "dynamic");
addMac("wlc1", "02:40:25:00:00:40", 250, "TenGigabitEthernet0/0/0", "dynamic");
addMac("wlc1", "02:40:25:00:00:40", 250, "TenGigabitEthernet0/0/1", "dynamic");
addArp("dist1", "10.40.250.40", "02:40:25:00:00:40", 250);
addArp("dist2", "10.40.250.40", "02:40:25:00:00:40", 250);

for (const item of devices) {
  const svi = interfaces.find(
    (iface) => iface.deviceId === item.id && iface.mode === "svi" && iface.ip === item.mgmtIp && iface.vlanId,
  );
  if (!svi?.vlanId || svi.prefix === undefined) continue;
  addMac(item.id, item.mac, svi.vlanId, svi.name, "static");
  learnOnTrunks(item.id, item.mac, svi.vlanId);
  for (const peer of devices) {
    if (peer.id === item.id) continue;
    if (peer.role !== "distribution" && peer.role !== "core") continue;
    if (!sharesSubnet(item.mgmtIp, svi.prefix, peer.id)) continue;
    addArp(peer.id, item.mgmtIp, item.mac, svi.vlanId);
  }
}

for (const iface of interfaces) {
  if (!iface.ip || iface.prefix === undefined || iface.adminStatus !== "up") continue;
  const network = networkAddress(iface.ip, iface.prefix);
  if (!network) continue;
  addRoute(iface.deviceId, `${network}/${iface.prefix}`, "connected", "connected", iface.name, 0);
}

const prefixes4c = [
  "10.40.8.0/24",
  "10.40.20.0/24",
  "10.40.100.0/23",
  "10.40.120.0/23",
  "10.40.200.0/24",
  "10.40.24.0/24",
  "10.40.250.0/23",
  "10.40.40.0/24",
];
for (const prefix of prefixes4c) {
  addRoute("core1", prefix, "ospf", "10.40.0.2", "GigabitEthernet0/0/0", 110);
  addRoute("core1", prefix, "ospf", "10.40.0.6", "GigabitEthernet0/0/1", 110);
  addRoute("core2", prefix, "ospf", "10.40.0.10", "GigabitEthernet0/0/0", 110);
  addRoute("core2", prefix, "ospf", "10.40.0.14", "GigabitEthernet0/0/1", 110);
}
for (const prefix of ["10.40.9.0/24", "10.40.110.0/24"]) {
  addRoute("core2", prefix, "ospf", "10.40.0.26", "GigabitEthernet0/0/2", 110);
  addRoute("core1", prefix, "ospf", "10.40.0.38", "GigabitEthernet0/0/5", 120);
}
for (const prefix of ["10.40.1.0/24", "10.40.16.0/24"]) {
  addRoute("core1", prefix, "ospf", "10.40.0.34", "GigabitEthernet0/0/4", 20);
  addRoute("core2", prefix, "ospf", "10.40.0.37", "GigabitEthernet0/0/5", 30);
}
addRoute("core7", "10.40.0.0/16", "bgp", "172.16.0.1", "GigabitEthernet0/0/0", 20);
addRoute("core7", "10.70.100.0/24", "static", "10.70.8.21", "GigabitEthernet0/0/1", 1);
addRoute("fw1", "10.40.24.0/24", "static", "10.40.0.17", "ethernet1/1", 10);
addRoute("fw1", "10.40.20.0/24", "static", "10.40.0.17", "ethernet1/1", 10);
addRoute("fw1", "10.40.40.0/24", "static", "10.40.0.17", "ethernet1/1", 10);
addRoute("fw1", "10.40.100.0/23", "static", "10.40.0.17", "ethernet1/1", 10);
addRoute("core1", "0.0.0.0/0", "static", "10.40.0.22", "GigabitEthernet0/0/3", 1);
addRoute("core2", "0.0.0.0/0", "static", "10.40.0.37", "GigabitEthernet0/0/5", 1);
addRoute("dist1", "0.0.0.0/0", "ospf", "10.40.0.1", "TenGigabitEthernet1/0/1", 110);
addRoute("dist2", "0.0.0.0/0", "ospf", "10.40.0.5", "TenGigabitEthernet1/0/1", 110);
addRoute("wan1", "0.0.0.0/0", "static", "198.51.100.1", "GigabitEthernet0/0/1", 1);

for (const item of devices) {
  if (item.role === "access" || item.role === "management" || item.role === "wireless") {
    const gateway = item.region === "REGN07" ? "10.70.8.1" : item.site === "REGN10-2A" ? "10.40.9.1" : "10.40.8.1";
    addRoute(item.id, "0.0.0.0/0", "static", gateway, undefined, 1);
  }
}

function addPolicy(policy: Policy) {
  policies.push(policy);
}

addPolicy({
  id: "fw-badge-auth",
  deviceId: "fw1",
  name: "badge-auth",
  kind: "security-rule",
  action: "allow",
  summary: "East badge reader to the building auth server on SSL",
  matches: ["10.40.24.46", "10.40.20.15"],
  text: "set rulebase security rules badge-auth from trust to servers source 10.40.24.46 destination 10.40.20.15 application ssl action allow",
});
addPolicy({
  id: "fw-print",
  deviceId: "fw1",
  name: "print-scan-to-email",
  kind: "security-rule",
  action: "allow",
  summary: "Reserved print-room address to the mail relay on SMTP",
  matches: ["10.40.40.15", "10.40.20.25"],
  text: "set rulebase security rules print-scan-to-email from trust to servers source 10.40.40.15 destination 10.40.20.25 application smtp action allow",
});
addPolicy({
  id: "fw-users",
  deviceId: "fw1",
  name: "users-east-out",
  kind: "security-rule",
  action: "allow",
  summary: "East user subnet toward the servers zone",
  matches: ["10.40.100.0/23"],
  text: "set rulebase security rules users-east-out from trust to servers source 10.40.100.0/23 destination any application any action allow",
});
addPolicy({
  id: "fw-collect",
  deviceId: "fw1",
  name: "mgmt-to-collectors",
  kind: "security-rule",
  action: "allow",
  summary: "Management subnet to the log and SNMP collector",
  matches: ["10.40.8.0/24", "10.40.20.50"],
  text: "set rulebase security rules mgmt-to-collectors from mgmt to servers source 10.40.8.0/24 destination 10.40.20.50 application snmp action allow",
});
addPolicy({
  id: "fw-mgt-address",
  deviceId: "fw1",
  name: "C9300-REGN10-4C-MGT-1",
  kind: "address-object",
  action: "object",
  summary: "Address object for the building management switch",
  matches: ["10.40.8.14", "C9300-REGN10-4C-MGT-1"],
  text: "set address C9300-REGN10-4C-MGT-1 ip-netmask 10.40.8.14/32\nset address C9300-REGN10-4C-MGT-1 description \"Building 4C management switch\"",
});

for (const core of ["core1", "core2"]) {
  addPolicy({
    id: `${core}-ssh`,
    deviceId: core,
    name: "MGMT-SSH",
    kind: "acl",
    action: "permit",
    summary: "SSH permitted from the 4C management switch and the management subnet",
    matches: ["10.40.8.14", "10.40.8.0/24"],
    text: "permit tcp host 10.40.8.14 any eq 22\npermit tcp 10.40.8.0 0.0.0.255 any eq 22",
  });
}

for (const item of devices) {
  if (item.vendor !== "Cisco") continue;
  addPolicy({
    id: `${item.id}-snmp`,
    deviceId: item.id,
    name: "SNMP-MGMT",
    kind: "acl",
    action: "permit",
    summary: "SNMP restricted to management subnets",
    matches: ["10.40.8.0/24", "10.40.9.0/24", "10.70.8.0/24"],
    text: "permit 10.40.8.0 0.0.0.255\npermit 10.40.9.0 0.0.0.255\npermit 10.70.8.0 0.0.0.255",
  });
}

addPolicy({
  id: "core7-summary",
  deviceId: "core7",
  name: "REGN10-SUMMARY",
  kind: "prefix-list",
  action: "permit",
  summary: "Region 10 aggregate carried from the transit",
  matches: ["10.40.0.0/16"],
  text: "ip prefix-list REGN10-SUMMARY seq 10 permit 10.40.0.0/16",
});

function renderInterface(iface: NetInterface, os: string): string[] {
  const lines = [`interface ${iface.name}`];
  if (iface.description) lines.push(` description ${iface.description}`);
  if (iface.mode === "trunk") {
    lines.push(" switchport mode trunk");
    if (iface.nativeVlan !== undefined) lines.push(` switchport trunk native vlan ${iface.nativeVlan}`);
    if (iface.allowedVlans?.length) {
      lines.push(` switchport trunk allowed vlan ${iface.allowedVlans.join(",")}`);
    }
  } else if (iface.mode === "access") {
    lines.push(" switchport mode access");
    if (iface.accessVlan !== undefined) lines.push(` switchport access vlan ${iface.accessVlan}`);
  } else if (os === "NX-OS" && iface.mode === "routed") {
    lines.push(" no switchport");
  }
  if (iface.ip && iface.prefix !== undefined) {
    lines.push(` ip address ${iface.ip} ${dottedMask(iface.prefix)}`);
  }
  if (iface.standbyIp && iface.vlanId) {
    lines.push(` standby ${iface.vlanId} ip ${iface.standbyIp}`);
  }
  if (iface.adminStatus === "down") lines.push(" shutdown");
  lines.push("!");
  return lines;
}

function renderIos(item: Device): string[] {
  const ownVlans = vlans.filter((vlan) => vlan.deviceId === item.id);
  const ownIfaces = interfaces.filter((iface) => iface.deviceId === item.id);
  const ownPolicies = policies.filter((policy) => policy.deviceId === item.id && policy.kind === "acl");
  const staticRoutes = routes.filter(
    (route) => route.deviceId === item.id && route.protocol === "static" && route.prefix !== "0.0.0.0/0",
  );
  const defaults = routes.filter(
    (route) => route.deviceId === item.id && route.protocol === "static" && route.prefix === "0.0.0.0/0",
  );
  const lines = [
    "! SWAN indexed running-config",
    `! Device: ${item.hostname}`,
    `! Platform: ${item.platform} ${item.os} ${item.osVersion}`,
    `! Captured: ${CAPTURED_AT}`,
    "!",
    `version ${item.osVersion}`,
    `hostname ${item.hostname}`,
    "!",
    "ntp server 10.40.1.5",
    "snmp-server community swan-ro RO SNMP-MGMT",
    "snmp-server host 10.40.20.50 version 2c swan-ro",
    "logging host 10.40.20.50",
    "!",
  ];
  for (const vlan of ownVlans) {
    lines.push(`vlan ${vlan.vlanId}`, ` name ${vlan.name}`, "!");
  }
  for (const policy of ownPolicies) {
    const kind = policy.text.includes("tcp") ? "extended" : "standard";
    lines.push(`ip access-list ${kind} ${policy.name}`);
    for (const rule of policy.text.split("\n")) lines.push(` ${rule}`);
    lines.push("!");
  }
  for (const iface of ownIfaces) lines.push(...renderInterface(iface, item.os));
  for (const route of staticRoutes) {
    const [net, length] = route.prefix.split("/");
    lines.push(`ip route ${net} ${dottedMask(Number(length))} ${route.nextHop}`);
  }
  for (const route of defaults) lines.push(`ip route 0.0.0.0 0.0.0.0 ${route.nextHop}`);
  if (item.role === "access" || item.role === "management" || item.role === "wireless") {
    const gateway = defaults[0]?.nextHop;
    if (gateway) lines.push(`ip default-gateway ${gateway}`);
  }
  if (item.role === "core") {
    lines.push(
      "!",
      "router ospf 10",
      ` router-id ${item.mgmtIp}`,
      " passive-interface default",
      " no passive-interface GigabitEthernet0/0/0",
      "!",
    );
  }
  lines.push("end");
  return lines;
}

function renderNxos(item: Device): string[] {
  const lines = [
    "! SWAN indexed running-config",
    `! Device: ${item.hostname}`,
    `! Platform: ${item.platform} NX-OS ${item.osVersion}`,
    `! Captured: ${CAPTURED_AT}`,
    "!",
    `hostname ${item.hostname}`,
    "nv overlay evpn",
    "feature ospf",
    "feature interface-vlan",
    "!",
    "ntp server 10.40.1.5 use-vrf default",
    "snmp-server host 10.40.20.50 version 2c swan-ro",
    "!",
  ];
  for (const vlan of vlans.filter((entry) => entry.deviceId === item.id)) {
    lines.push(`vlan ${vlan.vlanId}`, `  name ${vlan.name}`);
  }
  lines.push("!");
  for (const iface of interfaces.filter((entry) => entry.deviceId === item.id)) {
    lines.push(...renderInterface(iface, "NX-OS"));
  }
  lines.push("end");
  return lines;
}

function renderPan(item: Device): string[] {
  const lines = [
    "! SWAN indexed PAN-OS configuration",
    `! Device: ${item.hostname}`,
    `! Platform: ${item.platform} PAN-OS ${item.osVersion}`,
    `! Captured: ${CAPTURED_AT}`,
    "!",
    `set deviceconfig system hostname ${item.hostname}`,
    `set deviceconfig system ip-address ${item.mgmtIp}`,
    "set deviceconfig system ntp-servers primary-ntp-server 10.40.1.5",
    "!",
  ];
  for (const iface of interfaces.filter((entry) => entry.deviceId === item.id)) {
    if (iface.ip && iface.prefix !== undefined) {
      lines.push(`set network interface ${iface.name} layer3 ip ${iface.ip}/${iface.prefix}`);
    }
  }
  lines.push("!");
  for (const policy of policies.filter((entry) => entry.deviceId === item.id)) {
    for (const rule of policy.text.split("\n")) lines.push(rule);
  }
  lines.push("!");
  for (const route of routes.filter((entry) => entry.deviceId === item.id && entry.protocol === "static")) {
    lines.push(
      `set network virtual-router default routing-table ip static-route ${route.prefix.replace("/", "-")} destination ${route.prefix} nexthop ip-address ${route.nextHop}`,
    );
  }
  return lines;
}

const configs: ConfigDoc[] = devices.map((item) => ({
  deviceId: item.id,
  capturedAt: CAPTURED_AT,
  lines:
    item.vendor === "Palo Alto"
      ? renderPan(item)
      : item.os === "NX-OS"
        ? renderNxos(item)
        : renderIos(item),
}));

const netboxPrefixes: NetBoxPrefix[] = [
  { prefix: "10.40.8.0/24", description: "Building 4C management", site: "Region 10 · Building 4C", vlanId: 10, role: "management", status: "active" },
  { prefix: "10.40.20.0/24", description: "Building 4C out-of-band servers", site: "Region 10 · Building 4C", vlanId: 20, role: "servers", status: "active" },
  { prefix: "10.40.24.0/24", description: "Building 4C badge readers", site: "Region 10 · Building 4C", vlanId: 240, role: "badge", status: "active" },
  { prefix: "10.40.40.0/24", description: "Building 4C printers", site: "Region 10 · Building 4C", vlanId: 400, role: "printers", status: "active" },
  { prefix: "10.40.100.0/23", description: "Building 4C east users", site: "Region 10 · Building 4C", vlanId: 100, role: "users", status: "active" },
  { prefix: "10.40.120.0/23", description: "Building 4C west users", site: "Region 10 · Building 4C", vlanId: 120, role: "users", status: "active" },
  { prefix: "10.40.200.0/24", description: "Building 4C voice", site: "Region 10 · Building 4C", vlanId: 200, role: "voice", status: "active" },
  { prefix: "10.40.250.0/23", description: "Building 4C corporate WLAN", site: "Region 10 · Building 4C", vlanId: 250, role: "wireless", status: "active" },
  { prefix: "10.40.9.0/24", description: "Building 2A management", site: "Region 10 · Building 2A", vlanId: 11, role: "management", status: "active" },
  { prefix: "10.40.110.0/24", description: "Building 2A users", site: "Region 10 · Building 2A", vlanId: 110, role: "users", status: "active" },
  { prefix: "10.40.1.0/24", description: "Region 10 NTP", site: "Region 10 · Data Center", vlanId: 5, role: "infrastructure", status: "active" },
  { prefix: "10.40.16.0/24", description: "Region 10 application servers", site: "Region 10 · Data Center", vlanId: 160, role: "servers", status: "active" },
  { prefix: "10.70.8.0/24", description: "Region 07 management", site: "Region 07 · Building 1A", vlanId: 10, role: "management", status: "active" },
  { prefix: "10.70.100.0/24", description: "Region 07 users", site: "Region 07 · Building 1A", vlanId: 100, role: "users", status: "active" },
  { prefix: "10.40.0.0/16", description: "Region 10 aggregate", site: "Region 10 · Core", role: "aggregate", status: "active" },
];

function zoneFor(region: string): string {
  return region === "REGN07" ? "regn07.swan.net" : "regn10.swan.net";
}

const netboxIps: NetBoxIp[] = [];
const dns: DnsRecord[] = [];

function addDns(name: string, ip: string, region: string) {
  const zone = zoneFor(region);
  dns.push({ name, type: "A", value: ip, zone });
  dns.push({
    name: `${ip.split(".").reverse().join(".")}.in-addr.arpa`,
    type: "PTR",
    value: name,
    zone: "in-addr.arpa",
  });
}

function prefixFor(ip: string): NetBoxPrefix | undefined {
  return netboxPrefixes
    .filter((prefix) => prefix.prefix !== "10.40.0.0/16" && prefixContains(prefix.prefix, ip))
    .sort((a, b) => prefixLengthSafe(b.prefix) - prefixLengthSafe(a.prefix))[0];
}

function prefixLengthSafe(cidr: string): number {
  return Number(cidr.split("/")[1]);
}

for (const item of devices) {
  const prefix = prefixFor(item.mgmtIp);
  const fqdn = `${item.hostname.toLowerCase()}.${zoneFor(item.region)}`;
  netboxIps.push({
    address: prefix ? `${item.mgmtIp}/${prefix.prefix.split("/")[1]}` : `${item.mgmtIp}/32`,
    status: "active",
    dnsName: fqdn,
    description: `${item.role} management address`,
    tenant: "Network",
    role: "management",
    assignedTo: item.hostname,
    prefix: prefix?.prefix ?? `${item.mgmtIp}/32`,
    prefixDescription: prefix?.description ?? "host route",
    vlanId: prefix?.vlanId,
    site: item.siteName,
  });
  addDns(fqdn, item.mgmtIp, item.region);
}

const endpointIps: NetBoxIp[] = [
  {
    address: "10.40.24.46/24",
    status: "active",
    dnsName: "badge-4c-east.regn10.swan.net",
    description: "HID Signo badge reader, east entrance, door E12",
    tenant: "Facilities",
    role: "endpoint",
    assignedTo: "badge-reader-4c-e12",
    prefix: "10.40.24.0/24",
    prefixDescription: "Building 4C badge readers",
    vlanId: 240,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.24.47/24",
    status: "active",
    dnsName: "badge-4c-lobby.regn10.swan.net",
    description: "HID Signo badge reader, main lobby",
    tenant: "Facilities",
    role: "endpoint",
    assignedTo: "badge-reader-4c-lobby",
    prefix: "10.40.24.0/24",
    prefixDescription: "Building 4C badge readers",
    vlanId: 240,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.24.22/24",
    status: "active",
    dnsName: "badge-4c-west.regn10.swan.net",
    description: "HID Signo badge reader, west entrance",
    tenant: "Facilities",
    role: "endpoint",
    assignedTo: "badge-reader-4c-west",
    prefix: "10.40.24.0/24",
    prefixDescription: "Building 4C badge readers",
    vlanId: 240,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.24.1/24",
    status: "active",
    dnsName: "gw-badge-4c.regn10.swan.net",
    description: "HSRP gateway for BADGE-ACCESS",
    tenant: "Network",
    role: "hsrp",
    assignedTo: "C9500-REGN10-4C-DIST-1 / C9500-REGN10-4C-DIST-2",
    prefix: "10.40.24.0/24",
    prefixDescription: "Building 4C badge readers",
    vlanId: 240,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.100.50/23",
    status: "active",
    dnsName: "workstation-4c-214.regn10.swan.net",
    description: "Dock, east wing 214. Asset WS-4C-214.",
    tenant: "Corporate",
    role: "endpoint",
    assignedTo: "WS-4C-214",
    prefix: "10.40.100.0/23",
    prefixDescription: "Building 4C east users",
    vlanId: 100,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.40.15/24",
    status: "reserved",
    description: "Print room 4C east queue. Hardware not installed.",
    tenant: "Corporate",
    role: "endpoint",
    assignedTo: "printer-4c-e-queue",
    prefix: "10.40.40.0/24",
    prefixDescription: "Building 4C printers",
    vlanId: 400,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.20.15/24",
    status: "active",
    dnsName: "badge-auth-4c.regn10.swan.net",
    description: "Badge authentication server",
    tenant: "Facilities",
    role: "server",
    assignedTo: "badge-auth-4c",
    prefix: "10.40.20.0/24",
    prefixDescription: "Building 4C out-of-band servers",
    vlanId: 20,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.20.25/24",
    status: "active",
    dnsName: "mail-relay-4c.regn10.swan.net",
    description: "Scan-to-email relay",
    tenant: "Corporate",
    role: "server",
    assignedTo: "mail-relay-4c",
    prefix: "10.40.20.0/24",
    prefixDescription: "Building 4C out-of-band servers",
    vlanId: 20,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.20.50/24",
    status: "active",
    dnsName: "collector-4c.regn10.swan.net",
    description: "SNMP and syslog collector",
    tenant: "Network",
    role: "server",
    assignedTo: "collector-4c",
    prefix: "10.40.20.0/24",
    prefixDescription: "Building 4C out-of-band servers",
    vlanId: 20,
    site: "Region 10 · Building 4C",
  },
  {
    address: "10.40.1.5/24",
    status: "active",
    dnsName: "ntp.regn10.swan.net",
    description: "Region 10 NTP appliance",
    tenant: "Network",
    role: "infrastructure",
    assignedTo: "ntp-regn10",
    prefix: "10.40.1.0/24",
    prefixDescription: "Region 10 NTP",
    vlanId: 5,
    site: "Region 10 · Data Center",
  },
  {
    address: "10.40.8.1/24",
    status: "active",
    description: "HSRP gateway for management",
    tenant: "Network",
    role: "hsrp",
    assignedTo: "C9500-REGN10-4C-DIST-1 / C9500-REGN10-4C-DIST-2",
    prefix: "10.40.8.0/24",
    prefixDescription: "Building 4C management",
    vlanId: 10,
    site: "Region 10 · Building 4C",
  },
];

netboxIps.push(...endpointIps);

for (const ip of endpointIps) {
  if (!ip.dnsName) continue;
  if (ip.address.startsWith("10.40.100.50/")) {
    dns.push({
      name: ip.dnsName,
      type: "A",
      value: "10.40.100.50",
      zone: "regn10.swan.net",
    });
    dns.push({
      name: "50.100.40.10.in-addr.arpa",
      type: "PTR",
      value: "workstation-4c-old.regn10.swan.net",
      zone: "in-addr.arpa",
    });
    continue;
  }
  addDns(ip.dnsName, ip.address.split("/")[0], "REGN10");
}

const alarms: Alarm[] = [
  {
    id: "nnmi-native-240",
    severity: "major",
    node: "C9300-REGN10-4C-ACC-3",
    deviceId: "acc3",
    interface: "GigabitEthernet1/0/47",
    summary: "Native VLAN mismatch with C9500-REGN10-4C-DIST-1 Te1/0/13",
    detail: "ACC-3 advertises native VLAN 240. DIST-1 expects native VLAN 999 on the same link.",
    time: "2026-10-27T15:12:00-06:00",
    state: "open",
    vlanIds: [240, 999],
  },
  {
    id: "nnmi-mac-move",
    severity: "major",
    node: "C9300-REGN10-4C-ACC-2",
    deviceId: "acc2",
    interface: "GigabitEthernet1/0/14",
    summary: "MAC 02:4c:10:00:02:19 moving between Gi1/0/14 and C9300-REGN10-4C-ACC-4 Gi1/0/9",
    detail: "The same dynamic MAC is being learned on two access ports in VLAN 100.",
    time: "2026-10-29T06:40:00-06:00",
    state: "open",
    vlanIds: [100],
    ips: ["10.40.100.50"],
    macs: ["02:4c:10:00:02:19"],
  },
  {
    id: "nnmi-ap-down",
    severity: "minor",
    node: "C9200-REGN10-4C-ACC-6",
    deviceId: "acc6",
    interface: "GigabitEthernet1/0/20",
    summary: "Link down: AP-4C-WEST-3",
    detail: "Access port toward AP-4C-WEST-3 is administratively down.",
    time: "2026-10-29T02:15:00-06:00",
    state: "open",
    vlanIds: [250],
  },
  {
    id: "nnmi-crc",
    severity: "warning",
    node: "ISR4451-REGN10-WAN-1",
    deviceId: "wan1",
    interface: "GigabitEthernet0/0/1",
    summary: "Input CRC errors increasing on the carrier handoff",
    detail: "NNMi counters on GigabitEthernet0/0/1 have been climbing since the previous evening.",
    time: "2026-10-28T21:02:00-06:00",
    state: "open",
  },
  {
    id: "nnmi-svi-400",
    severity: "minor",
    node: "C9500-REGN10-4C-DIST-2",
    deviceId: "dist2",
    interface: "Vlan400",
    summary: "SVI Vlan400 administratively down",
    detail: "PRINT SVI is shut on DIST-2 and remains up on DIST-1.",
    time: "2026-10-26T11:08:00-06:00",
    state: "open",
    vlanIds: [400],
  },
];

const changes: ChangeRecord[] = [
  {
    id: "na-acc3-native",
    deviceId: "acc3",
    time: "2026-10-27T15:10:00-06:00",
    user: "j.okeke",
    summary: "Access trunk native VLAN changed on Gi1/0/47",
    diff: [
      "interface GigabitEthernet1/0/47",
      "- switchport trunk native vlan 999",
      "+ switchport trunk native vlan 240",
      "- switchport trunk allowed vlan 10,20,100,120,200,240,250,400,999",
      "+ switchport trunk allowed vlan 10,20,100,120,200,240,250",
    ].join("\n"),
  },
  {
    id: "na-mgt-snmp",
    deviceId: "mgt1",
    time: "2026-10-23T09:42:00-06:00",
    user: "m.cho",
    summary: "SNMP trap host moved to the Region 10 collector",
    diff: [
      "- snmp-server host 10.40.20.18 version 2c swan-ro",
      "+ snmp-server host 10.40.20.50 version 2c swan-ro",
    ].join("\n"),
  },
  {
    id: "na-dist2-vlan400",
    deviceId: "dist2",
    time: "2026-10-26T11:05:00-06:00",
    user: "j.okeke",
    summary: "Shutdown Vlan400 during printer VLAN maintenance",
    diff: ["interface Vlan400", "+ shutdown"].join("\n"),
  },
  {
    id: "na-fw-print",
    deviceId: "fw1",
    time: "2026-10-20T16:18:00-06:00",
    user: "a.singh",
    summary: "Pre-staged print-scan-to-email for 10.40.40.15",
    diff: [
      "+ set rulebase security rules print-scan-to-email from trust to servers source 10.40.40.15 destination 10.40.20.25 application smtp action allow",
    ].join("\n"),
  },
];

export const corpus: Corpus = {
  devices,
  interfaces,
  vlans,
  arp,
  macs,
  routes,
  policies,
  configs,
  netboxIps,
  netboxPrefixes,
  netboxDevices: devices.map((item) => ({
    hostname: item.hostname,
    role: item.role,
    platform: `${item.vendor} ${item.platform}`,
    site: item.siteName,
    status: item.status,
    primaryIp: item.mgmtIp,
    serial: item.serial,
    rack: item.rack,
    region: item.region,
  })),
  dns,
  alarms,
  changes,
  capturedAt: CAPTURED_AT,
};
