import { anomalies } from "./anomalies";
import { corpus } from "./network/corpus";
import {
  containsToken,
  isIpv4,
  normalizeMac,
  prefixContains,
  prefixLength,
  reverseDnsName,
} from "./ip";
import type {
  Alarm,
  Anomaly,
  ChangeRecord,
  ConfigDoc,
  Device,
  Dossier,
  Investigation,
  MatrixRow,
  NetInterface,
  Policy,
  RouteEntry,
  SliceStats,
  Suggestion,
} from "./types";

const deviceById = new Map(corpus.devices.map((device) => [device.id, device]));

export function hostnameFor(id: string): string {
  return deviceById.get(id)?.hostname ?? id;
}

function deviceOf(id: string): Device | undefined {
  return deviceById.get(id);
}

function findInterface(deviceId: string, name: string): NetInterface | undefined {
  return corpus.interfaces.find(
    (iface) => iface.deviceId === deviceId && iface.name === name,
  );
}

function modeOf(deviceId: string, name: string): string {
  return findInterface(deviceId, name)?.mode ?? "unknown";
}

export type ParsedQuery =
  | { kind: "mac"; mac: string; query: string }
  | { kind: "ip"; ip: string; query: string }
  | { kind: "prefix"; prefix: string; query: string }
  | { kind: "vlan"; vlanId: number; query: string }
  | { kind: "text"; text: string; query: string };

export function parseQuery(raw: string): ParsedQuery {
  const query = raw.trim();
  const mac = normalizeMac(query);
  if (mac) return { kind: "mac", mac, query };
  if (/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(query)) {
    const [ip, lengthText] = query.split("/");
    const length = Number(lengthText);
    if (isIpv4(ip) && length >= 0 && length <= 32) {
      return { kind: "prefix", prefix: query, query };
    }
  }
  if (isIpv4(query)) return { kind: "ip", ip: query, query };
  const vlanMatch = query.match(/^vlan\s*(\d{1,4})$/i) ?? query.match(/^(\d{1,4})$/);
  if (vlanMatch && (/^vlan/i.test(query) || /^\d{1,4}$/.test(query))) {
    const vlanId = Number(vlanMatch[1]);
    if (vlanId >= 1 && vlanId <= 4094) return { kind: "vlan", vlanId, query };
  }
  return { kind: "text", text: query, query };
}

export function describeQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parseQuery(trimmed);
  if (parsed.kind === "ip") return "IP address";
  if (parsed.kind === "prefix") return "Prefix";
  if (parsed.kind === "mac") return "MAC address";
  if (parsed.kind === "vlan") return `VLAN ${parsed.vlanId}`;
  if (trimmed.length < 2) return null;
  const devices = matchDevices(trimmed);
  if (devices.length === 1) return "Device";
  if (devices.length > 1) return `${devices.length} devices`;
  return "Configuration";
}

function matchDevices(query: string): Device[] {
  const needle = query.toLowerCase();
  const exact = corpus.devices.filter((device) => device.hostname.toLowerCase() === needle);
  if (exact.length > 0) return exact;
  return corpus.devices.filter((device) => device.hostname.toLowerCase().includes(needle));
}

function configDocs(): ConfigDoc[] {
  return corpus.configs;
}

function searchLines(predicate: (line: string) => boolean): {
  deviceId: string;
  line: number;
  text: string;
}[] {
  const hits: { deviceId: string; line: number; text: string }[] = [];
  for (const doc of configDocs()) {
    doc.lines.forEach((text, index) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed === "!" || trimmed.startsWith("! SWAN") || trimmed.startsWith("! Captured") || trimmed.startsWith("! Platform") || trimmed.startsWith("! Device")) {
        return;
      }
      if (!predicate(text)) return;
      hits.push({ deviceId: doc.deviceId, line: index + 1, text: trimmed });
    });
  }
  return hits;
}

function countConfig(query: string): number {
  const needle = query.toLowerCase();
  return searchLines((line) => line.toLowerCase().includes(needle)).length;
}

function lineMentionsVlan(text: string, vlanId: number): boolean {
  if (containsToken(text, `vlan ${vlanId}`) || containsToken(text, `Vlan${vlanId}`)) return true;
  const allowed = text.match(/allowed vlan\s+([0-9,]+)/i);
  return Boolean(allowed && allowed[1].split(",").includes(String(vlanId)));
}

function policyMentions(
  policy: Policy,
  tokens: { ips: string[]; text: string[] },
  minPrefix = 20,
): boolean {
  return policy.matches.some((token) => {
    if (token.includes("/")) {
      if (prefixLength(token) < minPrefix) return false;
      return tokens.ips.some((ip) => prefixContains(token, ip));
    }
    if (tokens.ips.includes(token)) return true;
    return tokens.text.some((value) => value.toLowerCase() === token.toLowerCase());
  });
}

function routeCovers(route: RouteEntry, ip: string): boolean {
  if (route.prefix === "0.0.0.0/0") return false;
  return prefixContains(route.prefix, ip);
}

function blank(
  partial: Pick<Dossier, "query" | "queryType" | "title" | "subtitle">,
): Dossier {
  return {
    badges: [],
    chain: [],
    devices: [],
    interfaces: [],
    vlans: [],
    arp: [],
    macs: [],
    routes: [],
    policies: [],
    configDevices: [],
    configHits: [],
    netbox: [],
    dns: [],
    lookups: [],
    alarms: [],
    changes: [],
    anomalies: [],
    sources: [],
    highlightTokens: [partial.query],
    ...partial,
  };
}

interface Scope {
  queryType: Dossier["queryType"];
  subjectDeviceId?: string;
  primaryDeviceIds: string[];
  ips: string[];
  macs: string[];
  accessVlans: number[];
  vlanIds: number[];
}

function selectAnomalies(scope: Scope): Anomaly[] {
  return anomalies.filter((anomaly) => {
    if (anomaly.ips.some((ip) => scope.ips.includes(ip))) return true;
    if (anomaly.macs.some((mac) => scope.macs.includes(mac))) return true;
    if (scope.queryType === "device" && scope.subjectDeviceId && anomaly.deviceIds.includes(scope.subjectDeviceId)) {
      return true;
    }
    if (scope.queryType === "vlan" && anomaly.vlanIds.some((vlan) => scope.vlanIds.includes(vlan))) {
      return true;
    }
    if (
      (scope.queryType === "ip" || scope.queryType === "mac") &&
      anomaly.vlanIds.some((vlan) => scope.accessVlans.includes(vlan))
    ) {
      return true;
    }
    if (scope.queryType === "prefix" && anomaly.vlanIds.some((vlan) => scope.vlanIds.includes(vlan))) {
      return true;
    }
    return false;
  });
}

function selectAlarms(scope: Scope): Alarm[] {
  return corpus.alarms.filter((alarm) => {
    if (alarm.ips?.some((ip) => scope.ips.includes(ip))) return true;
    if (alarm.macs?.some((mac) => scope.macs.includes(mac))) return true;
    if (scope.queryType === "device" && alarm.deviceId === scope.subjectDeviceId) return true;
    if (scope.queryType === "vlan" && alarm.vlanIds?.some((vlan) => scope.vlanIds.includes(vlan))) {
      return true;
    }
    if (
      (scope.queryType === "ip" || scope.queryType === "mac") &&
      alarm.vlanIds?.some((vlan) => scope.accessVlans.includes(vlan))
    ) {
      return true;
    }
    if (scope.queryType === "prefix" && alarm.vlanIds?.some((vlan) => scope.vlanIds.includes(vlan))) {
      return true;
    }
    return false;
  });
}

function textMentionsVlan(text: string, vlanId: number): boolean {
  return new RegExp(`vlan\\s*${vlanId}\\b`, "i").test(text);
}

function selectChanges(scope: Scope): { hostname: string; change: ChangeRecord }[] {
  return corpus.changes
    .filter((change) => {
      const text = `${change.summary}\n${change.diff}`;
      if (scope.ips.some((ip) => containsToken(text, ip))) return true;
      if (scope.macs.some((mac) => text.toLowerCase().includes(mac))) return true;
      if (scope.queryType === "device" && change.deviceId === scope.subjectDeviceId) return true;
      if (scope.accessVlans.some((vlan) => textMentionsVlan(text, vlan))) return true;
      if (scope.queryType === "vlan" && scope.vlanIds.some((vlan) => textMentionsVlan(text, vlan))) {
        return true;
      }
      if (scope.queryType === "prefix" && scope.vlanIds.some((vlan) => textMentionsVlan(text, vlan))) {
        return true;
      }
      return false;
    })
    .map((change) => ({ hostname: hostnameFor(change.deviceId), change }));
}

function vlanSummary(vlanIds: number[]): Dossier["vlans"] {
  return vlanIds.map((vlanId) => {
    const defs = corpus.vlans.filter((vlan) => vlan.vlanId === vlanId);
    const names = [...new Set(defs.map((vlan) => vlan.name))];
    const related = corpus.interfaces.filter((iface) => interfaceUsesVlan(iface, vlanId));
    return {
      vlanId,
      name: names.join(" / ") || `VLAN ${vlanId}`,
      devices: defs.map((vlan) => hostnameFor(vlan.deviceId)),
      accessCount: related.filter((iface) => iface.mode === "access").length,
      trunkCount: related.filter((iface) => iface.mode === "trunk" && iface.nativeVlan !== vlanId).length,
      sviCount: related.filter((iface) => iface.mode === "svi").length,
      nativeCount: related.filter((iface) => iface.mode === "trunk" && iface.nativeVlan === vlanId).length,
    };
  });
}

function interfaceUsesVlan(iface: NetInterface, vlanId: number): boolean {
  if (iface.accessVlan === vlanId || iface.vlanId === vlanId || iface.nativeVlan === vlanId) return true;
  return Boolean(iface.mode === "trunk" && iface.allowedVlans?.includes(vlanId));
}

function interfaceNote(iface: NetInterface, focusVlan?: number): string {
  const notes: string[] = [];
  if (iface.adminStatus === "down") notes.push("Administratively down");
  else if (iface.operStatus === "down") notes.push("Down");
  if (iface.mode === "access") notes.push(`Access VLAN ${iface.accessVlan ?? ""}`.trim());
  if (iface.mode === "svi") notes.push(iface.standbyIp ? `SVI · HSRP ${iface.standbyIp}` : "SVI");
  if (iface.mode === "routed") notes.push("Routed");
  if (iface.mode === "loopback") notes.push("Loopback");
  if (iface.mode === "trunk" && focusVlan !== undefined && iface.nativeVlan === focusVlan) {
    notes.push("Native VLAN");
  } else if (iface.mode === "trunk") {
    notes.push("Trunk");
  }
  if (iface.neighborDeviceId && iface.neighborInterface && iface.nativeVlan !== undefined) {
    const peer = findInterface(iface.neighborDeviceId, iface.neighborInterface);
    if (peer?.nativeVlan !== undefined && peer.nativeVlan !== iface.nativeVlan) {
      notes.push("Native differs from peer");
    }
  }
  return notes.join(" · ");
}

function pushDevice(
  map: Map<string, Set<string>>,
  deviceId: string | undefined,
  reason: string,
) {
  if (!deviceId || !deviceById.has(deviceId)) return;
  const reasons = map.get(deviceId) ?? new Set<string>();
  reasons.add(reason);
  map.set(deviceId, reasons);
}

const reasonRank = ["Address", "HSRP", "Access port", "ARP", "MAC table", "Policy", "Configuration", "Route"];

function deviceRows(map: Map<string, Set<string>>): Dossier["devices"] {
  return [...map.entries()]
    .map(([deviceId, reasons]) => ({
      device: deviceById.get(deviceId)!,
      reasons: [...reasons].sort((a, b) => reasonRank.indexOf(a) - reasonRank.indexOf(b)),
    }))
    .sort((a, b) => {
      const left = Math.min(...a.reasons.map((reason) => reasonRank.indexOf(reason)));
      const right = Math.min(...b.reasons.map((reason) => reasonRank.indexOf(reason)));
      return left - right || a.device.hostname.localeCompare(b.device.hostname);
    });
}

function macRows(entries: { deviceId: string; mac: string; vlan: number; interface: string; type: "dynamic" | "static" }[]): Dossier["macs"] {
  const rank = (mode: string) => (mode === "access" ? 0 : mode === "svi" ? 1 : mode === "routed" ? 2 : 3);
  return entries
    .map((entry) => {
      const iface = findInterface(entry.deviceId, entry.interface);
      return {
        hostname: hostnameFor(entry.deviceId),
        entry,
        mode: iface?.mode ?? "unknown",
        description: iface?.description ?? "",
      };
    })
    .sort((a, b) => rank(a.mode) - rank(b.mode) || a.hostname.localeCompare(b.hostname) || a.entry.interface.localeCompare(b.entry.interface));
}

function matchingRoutes(ip: string): Dossier["routes"] {
  const matched = corpus.routes.filter((route) => routeCovers(route, ip));
  const best = matched.reduce((length, route) => Math.max(length, prefixLength(route.prefix)), -1);
  return matched
    .map((route) => ({
      hostname: hostnameFor(route.deviceId),
      route,
      longest: prefixLength(route.prefix) === best,
    }))
    .sort((a, b) => prefixLength(b.route.prefix) - prefixLength(a.route.prefix) || a.hostname.localeCompare(b.hostname));
}

function matchingPolicies(ips: string[], text: string[] = [], minPrefix = 20): Dossier["policies"] {
  return corpus.policies
    .filter((policy) => policyMentions(policy, { ips, text }, minPrefix))
    .map((policy) => ({
      hostname: hostnameFor(policy.deviceId),
      policy,
      exact: policy.matches.some((token) => ips.includes(token) || text.some((value) => value.toLowerCase() === token.toLowerCase())),
    }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.hostname.localeCompare(b.hostname))
    .slice(0, 8);
}

function netboxForIps(ips: string[]): Dossier["netbox"] {
  const cards: Dossier["netbox"] = [];
  for (const ip of ips) {
    const record = corpus.netboxIps.find((entry) => entry.address.split("/")[0] === ip);
    if (!record) continue;
    cards.push({
      title: record.address,
      rows: [
        { label: "Prefix", value: `${record.prefix} · ${record.prefixDescription}` },
        { label: "VRF", value: record.vrf },
        { label: "Status", value: record.status },
        { label: "Role", value: record.role },
        ...(record.dnsName ? [{ label: "DNS name", value: record.dnsName }] : []),
        { label: "Assigned to", value: record.assignedTo },
        { label: "Site", value: record.site },
        { label: "Tenant", value: record.tenant },
        ...(record.vlanId ? [{ label: "VLAN", value: String(record.vlanId) }] : []),
        { label: "Hierarchy", value: prefixHierarchy(ip) },
        { label: "Description", value: record.description },
      ],
    });
  }
  return cards;
}

function prefixHierarchy(ip: string): string {
  return corpus.netboxPrefixes
    .filter((prefix) => prefixContains(prefix.prefix, ip))
    .sort((a, b) => prefixLength(b.prefix) - prefixLength(a.prefix))
    .map((prefix) => prefix.prefix)
    .join(" → ");
}

function netboxDeviceCard(device: Device): Dossier["netbox"][number] {
  const record = corpus.netboxDevices.find((entry) => entry.hostname === device.hostname);
  return {
    title: device.hostname,
    rows: [
      { label: "Role", value: record?.role ?? device.role },
      { label: "Platform", value: record?.platform ?? `${device.vendor} ${device.platform}` },
      { label: "Site", value: record?.site ?? device.siteName },
      { label: "Rack", value: record?.rack ?? device.rack },
      { label: "Status", value: record?.status ?? device.status },
      { label: "Primary IP", value: record?.primaryIp ?? device.mgmtIp },
      { label: "Serial", value: record?.serial ?? device.serial },
    ],
  };
}

function dnsBundle(ips: string[], names: string[] = []): { records: Dossier["dns"]; lookups: Dossier["lookups"] } {
  const wanted = new Set(ips);
  const reverses = new Set(ips.map((ip) => reverseDnsName(ip)));
  const nameSet = new Set(names.map((name) => name.toLowerCase()));
  const records = corpus.dns
    .filter(
      (record) =>
        wanted.has(record.value) ||
        reverses.has(record.name) ||
        nameSet.has(record.name.toLowerCase()),
    )
    .map((record) => {
      const ptr = corpus.dns.find(
        (other) => other.type === "PTR" && other.name === reverseDnsName(record.value),
      );
      return {
        record,
        conflict: record.type === "A" && Boolean(ptr && ptr.value !== record.name),
      };
    });
  const lookups: Dossier["lookups"] = [];
  for (const ip of ips) {
    const forward = records.find((entry) => entry.record.type === "A" && entry.record.value === ip);
    const reverse = records.find((entry) => entry.record.type === "PTR" && entry.record.name === reverseDnsName(ip));
    const agrees = !forward || !reverse || forward.record.name === reverse.record.value;
    if (reverse) {
      lookups.push({ direction: "reverse", query: ip, answer: reverse.record.value, agreesWithCpnr: agrees });
    }
    if (forward) {
      lookups.push({ direction: "forward", query: forward.record.name, answer: forward.record.value, agreesWithCpnr: agrees });
    }
  }
  return { records, lookups };
}

function applyDns(dossier: Dossier, ips: string[], names: string[] = []) {
  const bundle = dnsBundle(ips, names);
  dossier.dns = bundle.records;
  dossier.lookups = bundle.lookups;
}

function prefixCard(prefix: { prefix: string; description: string; site: string; role: string; status: string; vrf: string; vlanId?: number }, vlanLabel?: string): Dossier["netbox"][number] {
  return {
    title: prefix.prefix,
    rows: [
      { label: "Description", value: prefix.description },
      { label: "VRF", value: prefix.vrf },
      { label: "Site", value: prefix.site },
      { label: "Role", value: prefix.role },
      { label: "Status", value: prefix.status },
      ...(prefix.vlanId ? [{ label: "VLAN", value: vlanLabel ?? String(prefix.vlanId) }] : []),
    ],
  };
}

function attachSources(dossier: Dossier): Dossier {
  const hit = (count: number, noun: string, empty: string) =>
    count > 0 ? `${count} ${noun}` : empty;
  const dnsAgrees = dossier.lookups.every((lookup) => lookup.agreesWithCpnr);
  dossier.sources = [
    {
      id: "config",
      tier: "indexed",
      label: "Configuration",
      system: "configs_swan",
      state: dossier.configHits.length || dossier.configDevices.length ? "hit" : "clear",
      detail: hit(dossier.configHits.length, "referencing lines", "No configuration line references this investigation"),
    },
    {
      id: "arp",
      tier: "indexed",
      label: "ARP",
      system: "show_swan_facts",
      state: dossier.arp.length ? "hit" : "clear",
      detail: hit(dossier.arp.length, "entries", "No ARP entry"),
    },
    {
      id: "mac",
      tier: "indexed",
      label: "MAC address table",
      system: "show_swan_facts",
      state: dossier.macs.length ? "hit" : "clear",
      detail: hit(dossier.macs.length, "entries", "No MAC entry"),
    },
    {
      id: "route",
      tier: "indexed",
      label: "Routes",
      system: "Correlation index",
      state: dossier.routes.length ? "hit" : "clear",
      detail: hit(dossier.routes.length, "routes", "No covering route"),
    },
    {
      id: "policy",
      tier: "indexed",
      label: "Policy",
      system: "configs_swan",
      state: dossier.policies.length ? "hit" : "clear",
      detail: hit(dossier.policies.length, "policies", "No policy reference"),
    },
    {
      id: "netbox",
      tier: "live",
      label: "NetBox",
      system: "IP / subnet context",
      state: dossier.netbox.length ? "hit" : "clear",
      detail: dossier.netbox.length ? `${dossier.netbox.length} records` : "No NetBox record",
    },
    {
      id: "dns",
      tier: "live",
      label: "DNS lookup",
      system: "Forward and reverse",
      state: dossier.lookups.length ? "hit" : "clear",
      detail: dossier.lookups.length
        ? dnsAgrees
          ? `${dossier.lookups.length} answers`
          : "Forward and reverse disagree"
        : "No DNS record found",
    },
    {
      id: "cpnr",
      tier: "live",
      label: "CPNR",
      system: "DNS records",
      state: dossier.dns.length ? "hit" : "clear",
      detail: dossier.dns.length
        ? dossier.dns.some((entry) => entry.conflict)
          ? "A and PTR disagree"
          : `${dossier.dns.length} records`
        : "No CPNR record found",
    },
    {
      id: "nnmi",
      tier: "live",
      label: "NNMi",
      system: "Related alarms",
      state: dossier.alarms.length ? "hit" : "clear",
      detail: dossier.alarms.length ? `${dossier.alarms.length} open alarms` : "No open alarm tied to this investigation",
    },
    {
      id: "na",
      tier: "live",
      label: "Network Automation",
      system: "Configuration changes",
      state: dossier.changes.length ? "hit" : "clear",
      detail: dossier.changes.length ? `${dossier.changes.length} related changes` : "No related configuration change",
    },
  ];
  return dossier;
}

function fullConfigs(deviceIds: string[]): Dossier["configDevices"] {
  return deviceIds.slice(0, 3).flatMap((deviceId) => {
    const device = deviceOf(deviceId);
    const doc = corpus.configs.find((entry) => entry.deviceId === deviceId);
    if (!device || !doc) return [];
    return [{ device, lines: doc.lines }];
  });
}

function dossierForDevice(device: Device, query: string): Dossier {
  const ownInterfaces = corpus.interfaces.filter((iface) => iface.deviceId === device.id);
  const reasons = new Map<string, Set<string>>([[device.id, new Set(["Address"])]]);
  const tokens = [device.hostname, device.mgmtIp];
  const hits = searchLines((line) => tokens.some((token) => containsToken(line, token)))
    .filter((hit) => hit.deviceId !== device.id)
    .slice(0, 30);
  for (const hit of hits) pushDevice(reasons, hit.deviceId, "Configuration");
  const arpHits = corpus.arp.filter((entry) => entry.deviceId === device.id || entry.ip === device.mgmtIp);
  for (const entry of arpHits) pushDevice(reasons, entry.deviceId, "ARP");
  const macHits = corpus.macs.filter((entry) => entry.deviceId === device.id || entry.mac === device.mac);
  const policies = matchingPolicies([device.mgmtIp], [device.hostname]);
  for (const policy of policies) pushDevice(reasons, policy.policy.deviceId, "Policy");
  const routes = corpus.routes
    .filter((route) => route.deviceId === device.id)
    .map((route) => ({ hostname: device.hostname, route, longest: route.protocol === "connected" }));
  const accessVlans = [
    ...new Set(
      ownInterfaces.flatMap((iface) =>
        [iface.accessVlan, iface.vlanId, iface.nativeVlan].filter((vlan): vlan is number => vlan !== undefined),
      ),
    ),
  ];
  const scope: Scope = {
    queryType: "device",
    subjectDeviceId: device.id,
    primaryDeviceIds: [device.id],
    ips: [device.mgmtIp],
    macs: [device.mac],
    accessVlans,
    vlanIds: accessVlans,
  };
  const foundAnomalies = selectAnomalies(scope);
  const alarms = selectAlarms(scope);
  const changes = selectChanges(scope);
  const deviceDnsName = `${device.hostname.toLowerCase()}.${device.region === "REGN07" ? "regn07.swan.net" : "regn10.swan.net"}`;
  const dossier = blank({
    query,
    queryType: "device",
    title: device.hostname,
    subtitle: `${device.vendor} ${device.platform} · ${device.os} ${device.osVersion} · ${device.siteName}`,
  });
  dossier.badges = [
    { label: device.role, tone: "neutral" },
    { label: device.status, tone: device.status === "up" ? "ok" : "attention" },
    { label: device.mgmtIp, tone: "info" },
  ];
  if (foundAnomalies.some((anomaly) => anomaly.severity === "major")) {
    dossier.badges.push({ label: "Correlation finding", tone: "attention" });
  }
  dossier.chain = [
    { id: "device", kind: "Device", label: device.hostname, detail: device.platform, query: device.hostname, tone: "neutral" },
    { id: "ip", kind: "Management IP", label: device.mgmtIp, detail: device.siteName, query: device.mgmtIp, tone: "ok" },
    { id: "vlan", kind: "VLANs", label: String(corpus.vlans.filter((vlan) => vlan.deviceId === device.id).length), detail: "Defined on this device", tone: "neutral" },
    {
      id: "evidence",
      kind: "Elsewhere",
      label: String(hits.length),
      detail: "Configuration references on other devices",
      tone: hits.length ? "attention" : "ok",
    },
  ];
  if (alarms.length) {
    dossier.chain.push({
      id: "alarm",
      kind: "NNMi",
      label: String(alarms.length),
      detail: alarms[0].summary,
      tone: "attention",
    });
  }
  dossier.devices = deviceRows(reasons);
  dossier.interfaces = ownInterfaces.map((iface) => ({
    hostname: device.hostname,
    iface,
    note: interfaceNote(iface),
  }));
  dossier.vlans = vlanSummary(
    [...new Set(corpus.vlans.filter((vlan) => vlan.deviceId === device.id).map((vlan) => vlan.vlanId))],
  ).map((vlan) => ({
    ...vlan,
    devices: vlan.devices.filter((hostname) => hostname === device.hostname),
  }));
  dossier.arp = arpHits.map((entry) => ({ hostname: hostnameFor(entry.deviceId), entry }));
  dossier.macs = macRows(macHits);
  dossier.routes = routes;
  dossier.policies = policies;
  dossier.configDevices = fullConfigs([device.id]);
  dossier.configHits = hits.map((hit) => ({ ...hit, hostname: hostnameFor(hit.deviceId), elsewhere: true }));
  dossier.netbox = [netboxDeviceCard(device), ...netboxForIps([device.mgmtIp])];
  applyDns(dossier, [device.mgmtIp], [deviceDnsName]);
  dossier.alarms = alarms;
  dossier.changes = changes;
  dossier.anomalies = foundAnomalies;
  dossier.highlightTokens = [device.hostname, device.mgmtIp, device.mac];
  return attachSources(dossier);
}

function uniqueVlansFromMacs(mac: string): number[] {
  return [...new Set(corpus.macs.filter((entry) => entry.mac === mac && modeOf(entry.deviceId, entry.interface) === "access").map((entry) => entry.vlan))];
}

function dossierForIp(ip: string, query: string): Dossier {
  const arpHits = corpus.arp.filter((entry) => entry.ip === ip);
  const macSet = new Set(arpHits.map((entry) => entry.mac));
  for (const iface of corpus.interfaces) {
    if (iface.ip === ip) {
      const device = deviceOf(iface.deviceId);
      if (device) macSet.add(device.mac);
    }
  }
  const macHits = corpus.macs.filter((entry) => macSet.has(entry.mac));
  const access = macHits.filter((entry) => modeOf(entry.deviceId, entry.interface) === "access");
  const accessVlans = [...new Set(access.map((entry) => entry.vlan))];
  const owners = corpus.interfaces.filter((iface) => iface.ip === ip || iface.standbyIp === ip);
  const netboxRecord = corpus.netboxIps.find((entry) => entry.address.split("/")[0] === ip);
  const described = corpus.interfaces.filter((iface) => containsToken(iface.description, ip));
  const relatedVlans = [
    ...new Set(
      [
        ...accessVlans,
        ...owners.map((iface) => iface.vlanId),
        ...described.map((iface) => iface.accessVlan ?? iface.vlanId),
        netboxRecord?.vlanId,
      ].filter((vlan): vlan is number => vlan !== undefined),
    ),
  ];
  const reasons = new Map<string, Set<string>>();
  for (const iface of owners) {
    pushDevice(reasons, iface.deviceId, iface.standbyIp === ip && iface.ip !== ip ? "HSRP" : "Address");
  }
  for (const entry of arpHits) pushDevice(reasons, entry.deviceId, "ARP");
  for (const entry of access) pushDevice(reasons, entry.deviceId, "Access port");
  for (const entry of macHits) pushDevice(reasons, entry.deviceId, "MAC table");
  const routes = matchingRoutes(ip);
  for (const route of routes) pushDevice(reasons, route.route.deviceId, "Route");
  const policies = matchingPolicies([ip]);
  for (const policy of policies) pushDevice(reasons, policy.policy.deviceId, "Policy");
  const dnsNames = corpus.dns.filter((record) => record.type === "A" && record.value === ip).map((record) => record.name);
  const tokens = [ip, ...dnsNames];
  const hits = searchLines((line) => tokens.some((token) => containsToken(line, token))).slice(0, 40);
  for (const hit of hits) pushDevice(reasons, hit.deviceId, "Configuration");
  const primary = [
    ...new Set([
      ...access.map((entry) => entry.deviceId),
      ...owners.filter((iface) => iface.ip === ip).map((iface) => iface.deviceId),
    ]),
  ];
  const scope: Scope = {
    queryType: "ip",
    primaryDeviceIds: primary,
    ips: [ip],
    macs: [...macSet],
    accessVlans: relatedVlans,
    vlanIds: relatedVlans,
  };
  const relevantInterfaces = new Map<string, NetInterface>();
  for (const iface of owners) relevantInterfaces.set(iface.id, iface);
  for (const iface of described) relevantInterfaces.set(iface.id, iface);
  for (const entry of macHits) {
    const iface = findInterface(entry.deviceId, entry.interface);
    if (iface) relevantInterfaces.set(iface.id, iface);
  }
  for (const entry of arpHits) {
    const iface = findInterface(entry.deviceId, entry.interface);
    if (iface) relevantInterfaces.set(iface.id, iface);
  }
  const netbox = netboxRecord;
  const bundledDns = dnsBundle([ip], dnsNames);
  const name = dnsNames[0] ?? netbox?.dnsName;
  const accessLabel = access[0]
    ? `${hostnameFor(access[0].deviceId)} ${access[0].interface}`
    : owners[0]
      ? `${hostnameFor(owners[0].deviceId)} ${owners[0].name}`
      : "Not learned on an access port";
  const dossier = blank({
    query,
    queryType: "ip",
    title: ip,
    subtitle: [name, accessVlans.length ? `VLAN ${accessVlans.join(", ")}` : null, accessLabel].filter(Boolean).join(" · "),
  });
  const standby = owners.find((iface) => iface.standbyIp === ip && iface.ip !== ip);
  const configured = owners.find((iface) => iface.ip === ip);
  dossier.badges = [
    { label: access.length > 1 ? "Multiple access ports" : access.length === 1 ? "Learned" : configured ? "Configured" : standby ? "HSRP" : "Not learned", tone: access.length > 1 ? "attention" : access.length || configured ? "ok" : "neutral" },
  ];
  if (netbox) dossier.badges.push({ label: `NetBox ${netbox.status}`, tone: netbox.status === "active" ? "ok" : "attention" });
  if (bundledDns.records.some((entry) => entry.conflict)) dossier.badges.push({ label: "DNS mismatch", tone: "attention" });
  const chainMac = arpHits[0]?.mac ?? (configured ? deviceOf(configured.deviceId)?.mac : undefined);
  dossier.chain = [
    { id: "ip", kind: "IP", label: ip, detail: name ?? "IPv4", query: ip, tone: "neutral" },
  ];
  if (chainMac) {
    dossier.chain.push({
      id: "mac",
      kind: "MAC",
      label: chainMac,
      detail: arpHits[0] ? `ARP on ${hostnameFor(arpHits[0].deviceId)}` : "Device MAC",
      query: chainMac,
      tone: "ok",
    });
  }
  if (access[0]) {
    dossier.chain.push({
      id: "port",
      kind: "Interface",
      label: access[0].interface,
      detail: hostnameFor(access[0].deviceId),
      query: hostnameFor(access[0].deviceId),
      tone: access.length > 1 ? "attention" : "ok",
    });
  } else if (configured) {
    dossier.chain.push({
      id: "port",
      kind: "Interface",
      label: configured.name,
      detail: hostnameFor(configured.deviceId),
      query: hostnameFor(configured.deviceId),
      tone: "ok",
    });
  }
  if (accessVlans[0] || owners[0]?.vlanId) {
    const vlanId = accessVlans[0] ?? owners[0]?.vlanId;
    if (vlanId) {
      const vlanName = corpus.vlans.find((vlan) => vlan.vlanId === vlanId)?.name ?? "";
      dossier.chain.push({
        id: "vlan",
        kind: "VLAN",
        label: `${vlanId} ${vlanName}`.trim(),
        detail: "Broadcast domain",
        query: `vlan ${vlanId}`,
        tone: "neutral",
      });
    }
  }
  const elsewhere = hits.filter((hit) => !primary.includes(hit.deviceId)).length;
  dossier.chain.push({
    id: "evidence",
    kind: "Elsewhere",
    label: String(elsewhere),
    detail: "Configuration references on other devices",
    tone: elsewhere ? "attention" : "ok",
  });
  dossier.devices = deviceRows(reasons);
  dossier.interfaces = [...relevantInterfaces.values()].map((iface) => ({
    hostname: hostnameFor(iface.deviceId),
    iface,
    note: interfaceNote(iface, accessVlans[0] ?? iface.vlanId),
  }));
  dossier.vlans = vlanSummary(relatedVlans.length ? relatedVlans : accessVlans);
  dossier.arp = arpHits.map((entry) => ({ hostname: hostnameFor(entry.deviceId), entry }));
  dossier.macs = macRows(macHits);
  dossier.routes = routes;
  dossier.policies = policies;
  dossier.configDevices = fullConfigs(primary.length ? primary : arpHits.map((entry) => entry.deviceId));
  const shown = new Set(dossier.configDevices.map((entry) => entry.device.id));
  dossier.configHits = hits.map((hit) => ({
    ...hit,
    hostname: hostnameFor(hit.deviceId),
    elsewhere: !shown.has(hit.deviceId),
  }));
  dossier.netbox = netboxForIps([ip]);
  const prefix = corpus.netboxPrefixes
    .filter((entry) => entry.prefix !== "10.40.0.0/16" && prefixContains(entry.prefix, ip))
    .sort((a, b) => prefixLength(b.prefix) - prefixLength(a.prefix))[0];
  if (prefix) dossier.netbox.push(prefixCard(prefix));
  const endpoint = access[0];
  const addressCard = dossier.netbox.find((card) => card.rows.some((row) => row.label === "Assigned to"));
  if (addressCard && endpoint) {
    const assignedAt = addressCard.rows.findIndex((row) => row.label === "Assigned to");
    addressCard.rows.splice(
      assignedAt + 1,
      0,
      { label: "Assigned device", value: hostnameFor(endpoint.deviceId) },
      { label: "Assigned interface", value: endpoint.interface },
    );
  }
  dossier.dns = bundledDns.records;
  dossier.lookups = bundledDns.lookups;
  dossier.alarms = selectAlarms(scope);
  dossier.changes = selectChanges(scope);
  dossier.anomalies = selectAnomalies(scope);
  if (dossier.anomalies.some((anomaly) => anomaly.severity === "major" || anomaly.severity === "warning")) {
    dossier.badges.push({ label: `${dossier.anomalies.length} findings`, tone: "attention" });
  }
  dossier.highlightTokens = [ip, ...macSet, ...dnsNames];
  return attachSources(dossier);
}

function dossierForMac(mac: string, query: string): Dossier {
  const macHits = corpus.macs.filter((entry) => entry.mac === mac);
  const arpHits = corpus.arp.filter((entry) => entry.mac === mac);
  const ips = [...new Set(arpHits.map((entry) => entry.ip))];
  if (ips.length === 1) {
    const dossier = dossierForIp(ips[0], query);
    dossier.query = query;
    dossier.queryType = "mac";
    dossier.title = mac;
    dossier.highlightTokens = [mac, ...ips];
    dossier.chain = [
      { id: "mac", kind: "MAC", label: mac, detail: "Starting point", query: mac, tone: "neutral" },
      ...dossier.chain.filter((node) => node.kind !== "MAC"),
    ];
    return dossier;
  }
  const access = macHits.filter((entry) => modeOf(entry.deviceId, entry.interface) === "access");
  const accessVlans = uniqueVlansFromMacs(mac);
  const reasons = new Map<string, Set<string>>();
  for (const entry of access) pushDevice(reasons, entry.deviceId, "Access port");
  for (const entry of macHits) pushDevice(reasons, entry.deviceId, "MAC table");
  const scope: Scope = {
    queryType: "mac",
    primaryDeviceIds: access.map((entry) => entry.deviceId),
    ips,
    macs: [mac],
    accessVlans,
    vlanIds: accessVlans,
  };
  const dossier = blank({
    query,
    queryType: "mac",
    title: mac,
    subtitle: access.length
      ? access.map((entry) => `${hostnameFor(entry.deviceId)} ${entry.interface}`).join(" · ")
      : "Not learned on an access port",
  });
  dossier.badges = [{ label: access.length > 1 ? "Multiple access ports" : "MAC", tone: access.length > 1 ? "attention" : "neutral" }];
  dossier.chain = [
    { id: "mac", kind: "MAC", label: mac, detail: "No ARP binding in the slice", tone: "attention" },
    ...access.map((entry) => ({
      id: entry.interface,
      kind: "Interface",
      label: entry.interface,
      detail: hostnameFor(entry.deviceId),
      query: hostnameFor(entry.deviceId),
      tone: "attention" as const,
    })),
  ];
  dossier.devices = deviceRows(reasons);
  dossier.interfaces = macHits.flatMap((entry) => {
    const iface = findInterface(entry.deviceId, entry.interface);
    return iface ? [{ hostname: hostnameFor(entry.deviceId), iface, note: interfaceNote(iface, entry.vlan) }] : [];
  });
  dossier.vlans = vlanSummary(accessVlans);
  dossier.macs = macRows(macHits);
  dossier.arp = arpHits.map((entry) => ({ hostname: hostnameFor(entry.deviceId), entry }));
  dossier.anomalies = selectAnomalies(scope);
  dossier.alarms = selectAlarms(scope);
  dossier.changes = selectChanges(scope);
  dossier.configDevices = fullConfigs(access.map((entry) => entry.deviceId));
  dossier.highlightTokens = [mac];
  return attachSources(dossier);
}

function dossierForVlan(vlanId: number, query: string): Dossier {
  const defs = corpus.vlans.filter((vlan) => vlan.vlanId === vlanId);
  const names = [...new Set(defs.map((vlan) => vlan.name))];
  const related = corpus.interfaces.filter((iface) => interfaceUsesVlan(iface, vlanId));
  const reasons = new Map<string, Set<string>>();
  for (const vlan of defs) pushDevice(reasons, vlan.deviceId, "Address");
  const arpHits = corpus.arp.filter((entry) => entry.interface === `Vlan${vlanId}`);
  for (const entry of arpHits) pushDevice(reasons, entry.deviceId, "ARP");
  const macHits = corpus.macs.filter((entry) => entry.vlan === vlanId);
  for (const entry of macHits) {
    pushDevice(reasons, entry.deviceId, modeOf(entry.deviceId, entry.interface) === "access" ? "Access port" : "MAC table");
  }
  const prefixes = corpus.netboxPrefixes.filter((prefix) => prefix.vlanId === vlanId);
  const routes = corpus.routes
    .filter((route) => prefixes.some((prefix) => route.prefix === prefix.prefix) || related.some((iface) => iface.deviceId === route.deviceId && iface.name === route.interface && iface.mode === "svi"))
    .map((route) => ({
      hostname: hostnameFor(route.deviceId),
      route,
      longest: prefixes.some((prefix) => prefix.prefix === route.prefix) || route.protocol === "connected",
    }));
  for (const route of routes) pushDevice(reasons, route.route.deviceId, "Route");
  const hits = searchLines((line) => lineMentionsVlan(line, vlanId)).slice(0, 50);
  for (const hit of hits) pushDevice(reasons, hit.deviceId, "Configuration");
  const ips = [...new Set(arpHits.map((entry) => entry.ip))];
  const scope: Scope = {
    queryType: "vlan",
    primaryDeviceIds: defs.map((vlan) => vlan.deviceId),
    ips,
    macs: [...new Set(macHits.map((entry) => entry.mac))],
    accessVlans: [vlanId],
    vlanIds: [vlanId],
  };
  const siteNames = [...new Set(defs.map((vlan) => deviceOf(vlan.deviceId)?.siteName).filter(Boolean))];
  const dossier = blank({
    query,
    queryType: "vlan",
    title: `VLAN ${vlanId}`,
    subtitle: names.length > 1
      ? `Names differ across the slice: ${names.join(" and ")}`
      : `${names[0] ?? "Undefined in the slice"} · ${siteNames.join(", ") || "No device defines it"}`,
  });
  dossier.badges = [
    { label: `${defs.length} devices`, tone: "neutral" },
    { label: `${related.filter((iface) => iface.mode === "access").length} access ports`, tone: "info" },
  ];
  if (names.length > 1) dossier.badges.push({ label: "ID reused", tone: "attention" });
  const native = related.filter((iface) => iface.nativeVlan === vlanId);
  dossier.chain = [
    { id: "vlan", kind: "VLAN", label: `${vlanId}`, detail: names.join(" / ") || "Not defined", query: `vlan ${vlanId}`, tone: "neutral" },
    { id: "svi", kind: "SVIs", label: String(related.filter((iface) => iface.mode === "svi").length), detail: "Gateways", tone: "ok" },
    { id: "access", kind: "Access", label: String(related.filter((iface) => iface.mode === "access").length), detail: "Edge ports", tone: "neutral" },
    { id: "native", kind: "Native", label: String(native.length), detail: native.length ? native.map((iface) => `${hostnameFor(iface.deviceId)} ${iface.name}`).slice(0, 2).join(", ") : "Not used as native", tone: native.length ? "attention" : "ok" },
  ];
  dossier.devices = deviceRows(reasons);
  dossier.interfaces = related.map((iface) => ({
    hostname: hostnameFor(iface.deviceId),
    iface,
    note: interfaceNote(iface, vlanId),
  }));
  dossier.vlans = vlanSummary([vlanId]);
  dossier.arp = arpHits.map((entry) => ({ hostname: hostnameFor(entry.deviceId), entry }));
  dossier.macs = macRows(macHits);
  dossier.routes = routes;
  dossier.policies = matchingPolicies(ips);
  dossier.configHits = hits.map((hit) => ({ ...hit, hostname: hostnameFor(hit.deviceId), elsewhere: false }));
  dossier.netbox = prefixes.map((prefix) => prefixCard(prefix, String(vlanId)));
  dossier.netbox.push(...netboxForIps(ips).slice(0, 6));
  applyDns(dossier, ips);
  dossier.alarms = selectAlarms(scope);
  dossier.changes = selectChanges(scope);
  dossier.anomalies = selectAnomalies(scope);
  if (dossier.anomalies.length) {
    dossier.badges.push({ label: `${dossier.anomalies.length} findings`, tone: "attention" });
  }
  dossier.highlightTokens = [`vlan ${vlanId}`, `Vlan${vlanId}`, String(vlanId)];
  return attachSources(dossier);
}

function dossierForPrefix(prefix: string, query: string): Dossier {
  const routes = corpus.routes
    .filter((route) => route.prefix === prefix || (prefixContains(route.prefix, prefix.split("/")[0]) && prefixLength(route.prefix) <= prefixLength(prefix) && route.prefix !== "0.0.0.0/0") || (prefixContains(prefix, route.prefix.split("/")[0]) && prefixLength(route.prefix) >= prefixLength(prefix)))
    .filter((route) => {
      if (route.prefix === prefix) return true;
      if (route.prefix === "0.0.0.0/0") return false;
      const routeLen = prefixLength(route.prefix);
      const wanted = prefixLength(prefix);
      if (routeLen >= wanted) return prefixContains(prefix, route.prefix.split("/")[0]);
      return prefixContains(route.prefix, prefix.split("/")[0]);
    });
  const exact = routes.filter((route) => route.prefix === prefix);
  const best = exact.length ? prefixLength(prefix) : routes.reduce((length, route) => Math.max(length, prefixLength(route.prefix)), -1);
  const routeRows = routes.map((route) => ({
    hostname: hostnameFor(route.deviceId),
    route,
    longest: prefixLength(route.prefix) === best,
  }));
  const reasons = new Map<string, Set<string>>();
  for (const route of routeRows) pushDevice(reasons, route.route.deviceId, "Route");
  const netboxPrefix = corpus.netboxPrefixes.find((entry) => entry.prefix === prefix);
  const arpHits = corpus.arp.filter((entry) => prefixContains(prefix, entry.ip));
  for (const entry of arpHits) pushDevice(reasons, entry.deviceId, "ARP");
  const ips = [...new Set(arpHits.map((entry) => entry.ip))];
  const vlanIds = netboxPrefix?.vlanId ? [netboxPrefix.vlanId] : [];
  const scope: Scope = {
    queryType: "prefix",
    primaryDeviceIds: routeRows.map((route) => route.route.deviceId),
    ips,
    macs: [...new Set(arpHits.map((entry) => entry.mac))],
    accessVlans: vlanIds,
    vlanIds,
  };
  const dossier = blank({
    query,
    queryType: "prefix",
    title: prefix,
    subtitle: netboxPrefix ? `${netboxPrefix.description} · ${netboxPrefix.site}` : "No NetBox prefix record",
  });
  dossier.badges = [
    { label: exact.length ? "Exact routes" : "Covering routes", tone: exact.length ? "ok" : "neutral" },
    { label: `${arpHits.length} ARP entries inside`, tone: "info" },
  ];
  dossier.chain = [
    { id: "prefix", kind: "Prefix", label: prefix, detail: netboxPrefix?.description ?? "Routing lookup", tone: "neutral" },
    { id: "routes", kind: "Routes", label: String(routeRows.length), detail: exact.length ? `${exact.length} exact` : "No exact match", tone: exact.length ? "ok" : "attention" },
  ];
  if (netboxPrefix?.vlanId) {
    dossier.chain.push({
      id: "vlan",
      kind: "VLAN",
      label: String(netboxPrefix.vlanId),
      detail: netboxPrefix.description,
      query: `vlan ${netboxPrefix.vlanId}`,
      tone: "neutral",
    });
  }
  dossier.devices = deviceRows(reasons);
  dossier.routes = routeRows.sort((a, b) => prefixLength(b.route.prefix) - prefixLength(a.route.prefix) || a.hostname.localeCompare(b.hostname));
  dossier.arp = arpHits.map((entry) => ({ hostname: hostnameFor(entry.deviceId), entry }));
  dossier.macs = macRows(corpus.macs.filter((entry) => arpHits.some((arp) => arp.mac === entry.mac) && modeOf(entry.deviceId, entry.interface) === "access"));
  dossier.vlans = vlanSummary(vlanIds);
  dossier.policies = matchingPolicies(ips.length ? ips : [prefix.split("/")[0]], [], 8);
  dossier.netbox = netboxPrefix ? [prefixCard(netboxPrefix)] : [];
  applyDns(dossier, ips);
  dossier.alarms = selectAlarms(scope);
  dossier.changes = selectChanges(scope);
  dossier.anomalies = selectAnomalies(scope);
  const hits = searchLines((line) => containsToken(line, prefix) || containsToken(line, prefix.split("/")[0])).slice(0, 20);
  dossier.configHits = hits.map((hit) => ({ ...hit, hostname: hostnameFor(hit.deviceId), elsewhere: true }));
  dossier.highlightTokens = [prefix];
  return attachSources(dossier);
}

function configSearch(query: string): Investigation {
  const needle = query.toLowerCase();
  const hits = searchLines((line) => line.toLowerCase().includes(needle));
  const grouped = new Map<string, { line: number; text: string }[]>();
  for (const hit of hits) {
    const list = grouped.get(hit.deviceId) ?? [];
    if (list.length < 6) list.push({ line: hit.line, text: hit.text });
    grouped.set(hit.deviceId, list);
  }
  const groups = [...grouped.entries()]
    .map(([deviceId, groupHits]) => ({ device: deviceById.get(deviceId)!, hits: groupHits }))
    .filter((group) => group.device)
    .sort((a, b) => b.hits.length - a.hits.length || a.device.hostname.localeCompare(b.device.hostname))
    .slice(0, 40);
  return {
    kind: "config-search",
    query,
    total: hits.length,
    truncated: hits.length > groups.reduce((sum, group) => sum + group.hits.length, 0),
    groups,
  };
}

export function investigate(raw: string, forceConfig = false): Investigation {
  const query = raw.trim();
  if (!query) return { kind: "empty" };
  const parsed = parseQuery(query);
  if (!forceConfig && parsed.kind === "mac") return { kind: "dossier", dossier: dossierForMac(parsed.mac, query) };
  if (!forceConfig && parsed.kind === "ip") return { kind: "dossier", dossier: dossierForIp(parsed.ip, query) };
  if (!forceConfig && parsed.kind === "prefix") return { kind: "dossier", dossier: dossierForPrefix(parsed.prefix, query) };
  if (!forceConfig && parsed.kind === "vlan") return { kind: "dossier", dossier: dossierForVlan(parsed.vlanId, query) };
  if (query.length < 2) return { kind: "short", query };
  if (!forceConfig) {
    const devices = matchDevices(query);
    if (devices.length === 1) return { kind: "dossier", dossier: dossierForDevice(devices[0], query) };
    if (devices.length > 1) {
      return { kind: "choose-device", query, devices, configHits: countConfig(query) };
    }
  }
  return configSearch(query);
}

export function suggest(raw: string): Suggestion[] {
  const needle = raw.trim().toLowerCase();
  if (!needle) return [];
  const suggestions: Suggestion[] = [];
  const devices = [...corpus.devices].sort((a, b) => {
    const aStarts = a.hostname.toLowerCase().startsWith(needle) ? 0 : 1;
    const bStarts = b.hostname.toLowerCase().startsWith(needle) ? 0 : 1;
    return aStarts - bStarts || a.hostname.localeCompare(b.hostname);
  });
  for (const device of devices) {
    if (!device.hostname.toLowerCase().includes(needle)) continue;
    suggestions.push({
      label: device.hostname,
      detail: `${device.platform} · ${device.mgmtIp} · ${device.siteName}`,
      query: device.hostname,
      type: "Device",
    });
  }
  const ips = new Set<string>();
  for (const entry of corpus.arp) ips.add(entry.ip);
  for (const iface of corpus.interfaces) {
    if (iface.ip) ips.add(iface.ip);
    if (iface.standbyIp) ips.add(iface.standbyIp);
  }
  for (const record of corpus.netboxIps) ips.add(record.address.split("/")[0]);
  for (const ip of [...ips].sort()) {
    const name = corpus.dns.find((record) => record.type === "A" && record.value === ip)?.name;
    const haystack = `${ip} ${name ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) continue;
    suggestions.push({
      label: ip,
      detail: name ?? "IP in the slice",
      query: ip,
      type: "IP",
    });
  }
  for (const mac of new Set(corpus.macs.map((entry) => entry.mac))) {
    if (!mac.includes(needle) && !mac.replace(/:/g, "").includes(needle.replace(/[:.-]/g, ""))) continue;
    suggestions.push({ label: mac, detail: "MAC table", query: mac, type: "MAC" });
  }
  const vlanIds = [...new Set(corpus.vlans.map((vlan) => vlan.vlanId))].sort((a, b) => a - b);
  for (const vlanId of vlanIds) {
    const names = [...new Set(corpus.vlans.filter((vlan) => vlan.vlanId === vlanId).map((vlan) => vlan.name))];
    const label = `VLAN ${vlanId}`;
    if (!`${label} ${names.join(" ")}`.toLowerCase().includes(needle) && !String(vlanId).startsWith(needle)) continue;
    suggestions.push({
      label,
      detail: names.join(" / "),
      query: `vlan ${vlanId}`,
      type: "VLAN",
    });
  }
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.query)) return false;
    seen.add(suggestion.query);
    return true;
  }).slice(0, 8);
}

export function sliceStats(): SliceStats {
  const ips = new Set<string>();
  for (const entry of corpus.arp) ips.add(entry.ip);
  for (const iface of corpus.interfaces) {
    if (iface.ip) ips.add(iface.ip);
    if (iface.standbyIp) ips.add(iface.standbyIp);
  }
  for (const record of corpus.netboxIps) ips.add(record.address.split("/")[0]);
  return {
    devices: corpus.devices.length,
    configRecords: corpus.configs.reduce((sum, doc) => sum + doc.lines.length, 0),
    arp: corpus.arp.length,
    mac: corpus.macs.length,
    correlatedIps: ips.size,
    correlatedMacs: new Set(corpus.macs.map((entry) => entry.mac)).size,
    routes: corpus.routes.length,
    policies: corpus.policies.length,
  };
}

export function vlanMatrix(): MatrixRow[] {
  const ids = [...new Set(corpus.vlans.map((vlan) => vlan.vlanId))].sort((a, b) => a - b);
  return ids.map((vlanId) => {
    const defs = corpus.vlans.filter((vlan) => vlan.vlanId === vlanId);
    const related = corpus.interfaces.filter((iface) => interfaceUsesVlan(iface, vlanId));
    const matched = anomalies.filter((anomaly) => anomaly.vlanIds.includes(vlanId));
    return {
      vlanId,
      names: [...new Set(defs.map((vlan) => vlan.name))],
      sites: [...new Set(defs.map((vlan) => deviceOf(vlan.deviceId)?.siteName).filter((site): site is string => Boolean(site)))],
      devices: defs.map((vlan) => hostnameFor(vlan.deviceId)),
      accessCount: related.filter((iface) => iface.mode === "access").length,
      trunkCount: related.filter((iface) => iface.mode === "trunk").length,
      nativeCount: related.filter((iface) => iface.nativeVlan === vlanId).length,
      sviCount: related.filter((iface) => iface.mode === "svi").length,
      sviDown: related.filter((iface) => iface.mode === "svi" && iface.adminStatus === "down").length,
      anomalyCount: matched.length,
      anomalyTitles: matched.map((anomaly) => anomaly.title),
    };
  });
}

export function notableAnomalies(): Anomaly[] {
  const rank: Record<string, number> = { critical: 0, major: 1, warning: 2, minor: 3, info: 4 };
  return [...anomalies].sort((a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title));
}

export function listAnomalies(): Anomaly[] {
  return anomalies;
}
