import { corpus } from "./network/corpus";
import {
  containsToken,
  formatRegina,
  isIpv4,
  reverseDnsName,
} from "./ip";
import type { Anomaly, MacEntry, NetInterface } from "./types";

const deviceById = new Map(corpus.devices.map((device) => [device.id, device]));

function hostname(id: string): string {
  return deviceById.get(id)?.hostname ?? id;
}

function findInterface(deviceId: string, name: string): NetInterface | undefined {
  return corpus.interfaces.find(
    (iface) => iface.deviceId === deviceId && iface.name === name,
  );
}

function changeMention(deviceIds: string[], pattern: RegExp): string | null {
  const change = corpus.changes.find(
    (entry) =>
      deviceIds.includes(entry.deviceId) &&
      (pattern.test(entry.summary) || pattern.test(entry.diff)),
  );
  if (!change) return null;
  return `Network Automation recorded “${change.summary}” by ${change.user} at ${formatRegina(change.time)}.`;
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("|");
}

function macAccessKey(entry: MacEntry): string {
  return `${entry.deviceId}|${entry.interface}`;
}

function buildAnomalies(): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const seenPairs = new Set<string>();

  for (const iface of corpus.interfaces) {
    if (!iface.neighborDeviceId || !iface.neighborInterface) continue;
    const peer = findInterface(iface.neighborDeviceId, iface.neighborInterface);
    if (!peer) continue;
    const key = pairKey(iface.id, peer.id);
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    if (iface.mode !== "trunk" || peer.mode !== "trunk") continue;

    if (
      iface.nativeVlan !== undefined &&
      peer.nativeVlan !== undefined &&
      iface.nativeVlan !== peer.nativeVlan
    ) {
      const deviceIds = [iface.deviceId, peer.deviceId];
      const recorded = changeMention(deviceIds, /native vlan/i);
      anomalies.push({
        id: `native:${key}`,
        code: "native-vlan-mismatch",
        severity: "major",
        title: "Native VLAN mismatch",
        detail: `${hostname(iface.deviceId)} ${iface.name} uses native VLAN ${iface.nativeVlan}. ${hostname(peer.deviceId)} ${peer.name} uses native VLAN ${peer.nativeVlan}.${recorded ? ` ${recorded}` : ""}`,
        query: `vlan ${iface.nativeVlan}`,
        vlanIds: [iface.nativeVlan, peer.nativeVlan],
        ips: [],
        macs: [],
        deviceIds,
      });
    }

    if (iface.allowedVlans && peer.allowedVlans) {
      const onlyIface = iface.allowedVlans.filter((vlan) => !peer.allowedVlans?.includes(vlan));
      const onlyPeer = peer.allowedVlans.filter((vlan) => !iface.allowedVlans?.includes(vlan));
      const differed = [...new Set([...onlyIface, ...onlyPeer])];
      if (differed.length > 0) {
        const missingNames = differed
          .map((vlan) => {
            const name = corpus.vlans.find((entry) => entry.vlanId === vlan)?.name;
            return name ? `${vlan} (${name})` : String(vlan);
          })
          .join(", ");
        anomalies.push({
          id: `allowed:${key}`,
          code: "allowed-vlan-mismatch",
          severity: "major",
          title: "Trunk allowed-VLAN mismatch",
          detail: `${hostname(iface.deviceId)} ${iface.name} and ${hostname(peer.deviceId)} ${peer.name} do not allow the same VLANs. The difference is ${missingNames}.`,
          query: `vlan ${differed[0]}`,
          vlanIds: differed,
          ips: [],
          macs: [],
          deviceIds: [iface.deviceId, peer.deviceId],
        });
      }
    }
  }

  const accessGroups = new Map<string, MacEntry[]>();
  for (const entry of corpus.macs) {
    const iface = findInterface(entry.deviceId, entry.interface);
    if (iface?.mode !== "access") continue;
    const key = `${entry.mac}|${entry.vlan}`;
    const group = accessGroups.get(key) ?? [];
    group.push(entry);
    accessGroups.set(key, group);
  }
  for (const [key, entries] of accessGroups) {
    const unique = new Map(entries.map((entry) => [macAccessKey(entry), entry]));
    if (unique.size < 2) continue;
    const [mac, vlanText] = key.split("|");
    const vlan = Number(vlanText);
    const places = [...unique.values()]
      .map((entry) => `${hostname(entry.deviceId)} ${entry.interface}`)
      .join(" and ");
    const ip = corpus.arp.find((entry) => entry.mac === mac)?.ip;
    anomalies.push({
      id: `mac-access:${key}`,
      code: "mac-on-multiple-access-ports",
      severity: "major",
      title: "MAC learned on two access ports",
      detail: `${mac} in VLAN ${vlan} is dynamic on ${places}.${ip ? ` ARP for ${ip} points at this MAC.` : ""}`,
      query: mac,
      vlanIds: [vlan],
      ips: ip ? [ip] : [],
      macs: [mac],
      deviceIds: [...unique.values()].map((entry) => entry.deviceId),
    });
  }

  for (const record of corpus.dns.filter((entry) => entry.type === "A")) {
    const ptr = corpus.dns.find(
      (entry) => entry.type === "PTR" && entry.name === reverseDnsName(record.value),
    );
    if (!ptr || ptr.value === record.name) continue;
    const arp = corpus.arp.find((entry) => entry.ip === record.value);
    const access = corpus.macs.filter(
      (entry) =>
        entry.mac === arp?.mac &&
        findInterface(entry.deviceId, entry.interface)?.mode === "access",
    );
    anomalies.push({
      id: `dns:${record.value}`,
      code: "dns-mismatch",
      severity: "warning",
      title: "Forward and reverse DNS disagree",
      detail: `${record.value} resolves to ${record.name}, but the PTR is ${ptr.value}.`,
      query: record.value,
      vlanIds: access.map((entry) => entry.vlan),
      ips: [record.value],
      macs: arp ? [arp.mac] : [],
      deviceIds: access.map((entry) => entry.deviceId),
    });
  }

  const exactIps = new Set<string>();
  for (const policy of corpus.policies) {
    for (const token of policy.matches) {
      if (isIpv4(token)) exactIps.add(token);
    }
  }
  for (const ip of exactIps) {
    const learned = corpus.arp.some((entry) => entry.ip === ip);
    const configured = corpus.interfaces.some(
      (iface) => iface.ip === ip || iface.standbyIp === ip,
    );
    if (learned || configured) continue;
    const policy = corpus.policies.find((entry) => entry.matches.includes(ip));
    const shut = corpus.interfaces.find(
      (iface) =>
        iface.adminStatus === "down" && containsToken(iface.description, ip),
    );
    anomalies.push({
      id: `policy:${ip}`,
      code: "policy-without-arp",
      severity: "warning",
      title: "Policy references an address ARP has not learned",
      detail: `${policy ? `${hostname(policy.deviceId)} ${policy.kind === "security-rule" ? "rule" : policy.kind} ${policy.name} references ${ip}` : ip}, and no device has it in ARP.${shut ? ` ${hostname(shut.deviceId)} ${shut.name} is shut and described with that address.` : ""}`,
      query: ip,
      vlanIds: shut?.accessVlan ? [shut.accessVlan] : [],
      ips: [ip],
      macs: [],
      deviceIds: policy ? [policy.deviceId] : [],
    });
  }

  for (const record of corpus.netboxIps) {
    const ip = record.address.split("/")[0];
    const learned = corpus.arp.some((entry) => entry.ip === ip);
    const configured = corpus.interfaces.some(
      (iface) => iface.ip === ip || iface.standbyIp === ip,
    );
    if (learned || configured || record.role === "hsrp") continue;
    if (record.status !== "reserved" && record.status !== "active") continue;
    if (record.status === "active" && record.role !== "endpoint" && record.role !== "server") {
      continue;
    }
    anomalies.push({
      id: `netbox:${ip}`,
      code: "netbox-arp-gap",
      severity: "warning",
      title: "NetBox and ARP disagree",
      detail: `${ip} is ${record.status} in NetBox for ${record.assignedTo} and is not learned in ARP.`,
      query: ip,
      vlanIds: record.vlanId ? [record.vlanId] : [],
      ips: [ip],
      macs: [],
      deviceIds: [],
    });
  }

  const svisByVlan = new Map<number, NetInterface[]>();
  for (const iface of corpus.interfaces) {
    if (iface.mode !== "svi" || iface.vlanId === undefined) continue;
    const group = svisByVlan.get(iface.vlanId) ?? [];
    group.push(iface);
    svisByVlan.set(iface.vlanId, group);
  }
  for (const [vlanId, group] of svisByVlan) {
    const up = group.filter((iface) => iface.adminStatus === "up");
    const down = group.filter((iface) => iface.adminStatus === "down");
    if (up.length === 0 || down.length === 0) continue;
    const sites = new Set(
      group.map((iface) => deviceById.get(iface.deviceId)?.site).filter(Boolean),
    );
    if (sites.size !== 1) continue;
    const recorded = changeMention(
      down.map((iface) => iface.deviceId),
      new RegExp(`vlan\\s*${vlanId}\\b`, "i"),
    );
    anomalies.push({
      id: `svi:${vlanId}`,
      code: "svi-asymmetric",
      severity: "warning",
      title: "SVI is down on one distribution switch",
      detail: `Vlan${vlanId} is up on ${up.map((iface) => hostname(iface.deviceId)).join(" and ")} and administratively down on ${down.map((iface) => hostname(iface.deviceId)).join(" and ")}.${recorded ? ` ${recorded}` : ""}`,
      query: `vlan ${vlanId}`,
      vlanIds: [vlanId],
      ips: [],
      macs: [],
      deviceIds: group.map((iface) => iface.deviceId),
    });
  }

  return anomalies;
}

export const anomalies: Anomaly[] = buildAnomalies();
