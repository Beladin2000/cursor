import { formatRegina, ouiVendor } from "./ip";
import type { Anomaly, Dossier, Summary } from "./types";

function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function identity(dossier: Dossier): string {
  if (dossier.queryType === "device") {
    const device = dossier.devices.find((row) => row.device.hostname === dossier.title)?.device ?? dossier.devices[0]?.device;
    if (!device) return `${dossier.query} did not resolve to a device in the loaded slice.`;
    const down = dossier.interfaces.filter((row) => row.iface.adminStatus === "down").length;
    return `${device.hostname} is a ${device.vendor} ${device.platform} running ${device.os} ${device.osVersion} at ${device.siteName}, rack ${device.rack}. Management address ${device.mgmtIp}. The indexed backup was taken ${formatRegina(device.lastBackup)}. This device has ${dossier.interfaces.length} interfaces, ${dossier.vlans.length} VLANs, ${dossier.arp.filter((row) => row.entry.deviceId === device.id).length} ARP entries, and ${dossier.routes.length} routes in the index.${down ? ` ${down} interfaces are administratively down.` : ""}`;
  }

  if (dossier.queryType === "ip" || (dossier.queryType === "mac" && dossier.arp[0])) {
    const ip = dossier.queryType === "ip" ? dossier.query : dossier.arp[0].entry.ip;
    const name = dossier.dns.find((entry) => entry.record.type === "A" && entry.record.value === ip)?.record.name;
    const access = dossier.macs.filter((row) => row.mode === "access");
    const configured = dossier.interfaces.find((row) => row.iface.ip === ip);
    const standby = dossier.interfaces.find((row) => row.iface.standbyIp === ip && row.iface.ip !== ip);
    const named = name ? `${ip} (${name})` : ip;
    if (standby && !configured && access.length === 0) {
      const peers = unique(dossier.interfaces.filter((row) => row.iface.standbyIp === ip).map((row) => row.hostname));
      return `${ip} is the HSRP address for ${standby.iface.name} on ${list(peers)}, not a host.`;
    }
    if (access.length === 1) {
      const port = access[0];
      const configuredClause = configured
        ? ` It is also configured on ${configured.hostname} ${configured.iface.name}.`
        : "";
      return `${named} is learned on ${port.hostname} ${port.entry.interface} in VLAN ${port.entry.vlan}${port.description ? ` (${port.description})` : ""}.${configuredClause}`;
    }
    if (access.length > 1) {
      return `${named} is learned on ${access.length} access ports in VLAN ${access[0].entry.vlan}: ${list(access.map((port) => `${port.hostname} ${port.entry.interface}`))}.`;
    }
    if (configured) {
      return `${named} is configured on ${configured.hostname} ${configured.iface.name}.`;
    }
    if (dossier.arp.length === 0 && dossier.netbox.length === 0 && dossier.configHits.length === 0 && dossier.routes.length === 0) {
      return `Nothing in the loaded slice references ${ip}.`;
    }
    return `${named} is not learned in ARP.`;
  }

  if (dossier.queryType === "mac") {
    const access = dossier.macs.filter((row) => row.mode === "access");
    if (access.length === 0) return `${dossier.query} is not learned on an access port in the slice.`;
    return `${dossier.query} is dynamic on ${list(access.map((port) => `${port.hostname} ${port.entry.interface}`))}.`;
  }

  if (dossier.queryType === "vlan") {
    const vlan = dossier.vlans[0];
    if (!vlan) return `${dossier.title} is not defined on a device in the loaded slice.`;
    const names = unique(dossier.vlans.map((entry) => entry.name));
    const sites = unique(dossier.devices.map((row) => row.device.siteName));
    const reuse = names.length > 1
      ? ` The VLAN ID is reused: ${list(names)}. Treat those as separate broadcast domains.`
      : "";
    return `VLAN ${vlan.vlanId} ${names.length === 1 ? names[0] : ""} is defined on ${vlan.devices.length} devices${sites.length ? ` across ${list(sites)}` : ""}. ${vlan.accessCount} access ports, ${vlan.sviCount} SVIs, ${vlan.trunkCount} trunks allow it, and ${vlan.nativeCount} trunks use it as the native VLAN.${reuse}`;
  }

  const exact = dossier.routes.filter((row) => row.route.prefix === dossier.query);
  const longest = dossier.routes.filter((row) => row.longest);
  if (exact.length === 0 && longest.length === 0) {
    return `${dossier.query} is not present in an indexed routing table.`;
  }
  const sample = (exact.length ? exact : longest).slice(0, 4);
  return `${dossier.query} ${dossier.subtitle === "No NetBox prefix record" ? "has no NetBox prefix" : `is ${dossier.subtitle}`}. Indexed routes include ${list(sample.map((row) => `${row.route.protocol} on ${row.hostname}`))}.`;
}

function pathParagraph(dossier: Dossier): string | null {
  if (dossier.queryType !== "ip" && dossier.queryType !== "mac") return null;
  const ip = dossier.queryType === "ip" ? dossier.query : dossier.arp[0]?.entry.ip;
  const mac = dossier.arp[0]?.entry.mac ?? (dossier.queryType === "mac" ? dossier.query : undefined);
  if (!mac) return null;
  const arpHosts = unique(dossier.arp.map((row) => row.hostname));
  const access = dossier.macs.filter((row) => row.mode === "access");
  const trunks = dossier.macs.filter((row) => row.mode === "trunk");
  const sentences = [
    arpHosts.length
      ? `ARP on ${list(arpHosts)} binds ${ip ?? "this host"} to ${mac} (${ouiVendor(mac)}).`
      : `${mac} has no ARP binding in the slice.`,
  ];
  if (access.length === 1) {
    sentences.push(`The MAC table has it on one access port, ${access[0].hostname} ${access[0].entry.interface}.`);
  } else if (access.length > 1) {
    sentences.push("The MAC table has it on more than one access port, so this is not a single stable edge.");
  }
  if (trunks.length > 0 && access.length === 1) {
    sentences.push(`It is also on ${trunks.length} trunk ${trunks.length === 1 ? "port" : "ports"} toward the gateway. That is the expected path, not a second access location.`);
  }
  return sentences.join(" ");
}

function sourceParagraph(dossier: Dossier): string {
  const sentences: string[] = [];
  const address = dossier.netbox.find((card) => card.rows.some((row) => row.label === "Assigned to"));
  if (address) {
    const status = address.rows.find((row) => row.label === "Status")?.value;
    const assigned = address.rows.find((row) => row.label === "Assigned to")?.value;
    const description = address.rows.find((row) => row.label === "Description")?.value;
    const prefix = address.rows.find((row) => row.label === "Prefix")?.value;
    const vrf = address.rows.find((row) => row.label === "VRF")?.value;
    sentences.push(`NetBox lists ${address.title} as ${status}, assigned to ${assigned}, in ${prefix}, VRF ${vrf}. ${description}`);
  } else if (dossier.queryType === "device" && dossier.netbox[0]) {
    const role = dossier.netbox[0].rows.find((row) => row.label === "Role")?.value;
    const site = dossier.netbox[0].rows.find((row) => row.label === "Site")?.value;
    sentences.push(`NetBox has the device as ${role} at ${site}.`);
  } else {
    sentences.push("NetBox has no object for this query.");
  }

  const forward = dossier.dns.find((entry) => entry.record.type === "A");
  const reverse = dossier.dns.find((entry) => entry.record.type === "PTR");
  const reverseLookup = dossier.lookups.find((lookup) => lookup.direction === "reverse");
  if (reverseLookup && forward && reverse) {
    sentences.push(
      forward.record.name === reverse.record.value
        ? `A reverse DNS lookup of ${reverseLookup.query} returns ${reverseLookup.answer}. The CPNR A and PTR agree on that name.`
        : `A reverse DNS lookup of ${reverseLookup.query} returns ${reverseLookup.answer}. The CPNR A record is ${forward.record.name}.`,
    );
  } else if (forward) {
    sentences.push(`CPNR has an A record for ${forward.record.name}. A forward lookup returns ${forward.record.value}.`);
  } else if (dossier.dns.length === 0 && dossier.lookups.length === 0) {
    sentences.push("DNS and CPNR have no record for this query in the slice.");
  }

  if (dossier.policies.length > 0) {
    const names = unique(dossier.policies.map((row) => `${row.policy.name} on ${row.hostname}`)).slice(0, 3);
    sentences.push(`Policy ${list(names)} references this investigation. SWAN does not have a flow record, so a policy hit is a configuration reference, not proof that a session traversed that device.`);
  }

  const longest = dossier.routes.filter((row) => row.longest);
  const wider = dossier.routes.filter((row) => !row.longest && row.route.prefix !== "0.0.0.0/0");
  if (longest.length > 0 && dossier.queryType !== "device") {
    const prefixes = unique(longest.map((row) => row.route.prefix));
    const hops = unique(longest.map((row) => `${row.route.protocol} via ${row.route.nextHop} on ${row.hostname}`)).slice(0, 4);
    sentences.push(`The longest routing match is ${list(prefixes)}: ${list(hops)}.`);
  }
  if (wider.length > 0 && dossier.queryType !== "device") {
    const covers = unique(wider.map((row) => `${row.route.prefix} on ${row.hostname}`)).slice(0, 3);
    sentences.push(`Wider covering routes are also indexed: ${list(covers)}.`);
  }

  if (dossier.changes.length > 0) {
    const recent = [...dossier.changes].sort((a, b) => b.change.time.localeCompare(a.change.time))[0];
    sentences.push(`The newest related Network Automation change is “${recent.change.summary}” by ${recent.change.user} at ${formatRegina(recent.change.time)} on ${recent.hostname}.`);
  } else {
    sentences.push("Network Automation has no related change in this slice.");
  }

  if (dossier.alarms.length === 0) {
    sentences.push("NNMi has no open alarm tied directly to this investigation.");
  }

  const elsewhere = dossier.configHits.filter((hit) => hit.elsewhere);
  if (elsewhere.length > 0) {
    const hosts = unique(elsewhere.map((hit) => hit.hostname)).slice(0, 4);
    sentences.push(`Indexed configuration on ${list(hosts)} also mentions it.`);
  }

  return sentences.join(" ");
}

function aboutHost(anomaly: Anomaly, dossier: Dossier): boolean {
  if (dossier.queryType === "vlan" || dossier.queryType === "prefix" || dossier.queryType === "device") return true;
  const ips = new Set([dossier.query, ...dossier.arp.map((row) => row.entry.ip)]);
  const macs = new Set(dossier.macs.map((row) => row.entry.mac));
  if (anomaly.ips.some((ip) => ips.has(ip))) return true;
  if (anomaly.macs.some((mac) => macs.has(mac))) return true;
  return false;
}

function healthyLines(dossier: Dossier): string[] {
  const lines: string[] = [];
  const access = dossier.macs.filter((row) => row.mode === "access");
  const hostTrouble = dossier.anomalies.some((anomaly) => aboutHost(anomaly, dossier) && (anomaly.code === "mac-on-multiple-access-ports" || anomaly.code === "dns-mismatch" || anomaly.code === "policy-without-arp" || anomaly.code === "netbox-arp-gap"));
  if (access.length === 1 && !hostTrouble) {
    lines.push(`The MAC is stable on one access port: ${access[0].hostname} ${access[0].entry.interface}.`);
  }
  const forward = dossier.dns.find((entry) => entry.record.type === "A");
  const reverse = dossier.dns.find((entry) => entry.record.type === "PTR");
  if (forward && reverse && forward.record.name === reverse.record.value) {
    lines.push("Forward and reverse DNS agree.");
  }
  const address = dossier.netbox.find((card) => card.rows.some((row) => row.label === "Status"));
  const status = address?.rows.find((row) => row.label === "Status")?.value;
  if (status === "active" && dossier.arp.length > 0 && !dossier.anomalies.some((anomaly) => anomaly.code === "netbox-arp-gap")) {
    lines.push("NetBox status is active and ARP has learned the address.");
  }
  if (dossier.alarms.length === 0 && dossier.queryType === "device") {
    lines.push("NNMi has no open alarm on this device.");
  }
  return lines;
}

function checksFor(dossier: Dossier): string[] {
  const checks: string[] = [];
  for (const anomaly of dossier.anomalies) {
    if (anomaly.code === "native-vlan-mismatch") {
      checks.push("Compare the intended native VLAN with the peer before changing it back. The indexed diff is in the Network Automation section.");
    }
    if (anomaly.code === "allowed-vlan-mismatch") {
      checks.push("Check whether the missing allowed VLANs were pruned on purpose. Hosts in a pruned VLAN will not cross that trunk.");
    }
    if (anomaly.code === "mac-on-multiple-access-ports") {
      checks.push("Confirm which access port should own the MAC. Until one side ages out, treat it as a move or a loop.");
    }
    if (anomaly.code === "dns-mismatch") {
      checks.push("Align the CPNR A record and PTR before putting the name in a ticket. The address itself is learned.");
    }
    if (anomaly.code === "policy-without-arp" || anomaly.code === "netbox-arp-gap") {
      checks.push("If the address is supposed to be live, find the access port and confirm the VLAN SVI. If it is still reserved, leave the pre-staged policy until the host exists.");
    }
    if (anomaly.code === "svi-asymmetric") {
      checks.push("Decide whether the shut SVI is still in maintenance. The peer that is still up is the one hosts can use.");
    }
  }
  if (dossier.alarms.some((alarm) => /CRC/i.test(alarm.summary))) {
    checks.push("Check the carrier handoff error counters and the optics before treating this as an internal VLAN problem.");
  }
  if (dossier.alarms.some((alarm) => /Link down/i.test(alarm.summary))) {
    checks.push("The down link is an interface state, separate from addresses learned on other ports.");
  }
  if (checks.length === 0 && dossier.arp.length > 0 && dossier.anomalies.length === 0) {
    checks.push("The edge port, ARP, and source of truth agree. If the symptom remains, look at the service behind the address rather than the switch port.");
  }
  return unique(checks).slice(0, 4);
}

function packet(dossier: Dossier): string {
  const lines = [
    `Investigation: ${dossier.queryType} ${dossier.query}`,
    `Resolved: ${dossier.title}`,
    dossier.subtitle,
    "",
    "Chain:",
    ...dossier.chain.map((node, index) => `${index + 1}. ${node.kind}: ${node.label} — ${node.detail}`),
    "",
    "Sources:",
    ...dossier.sources.map((source) => `- ${source.tier === "live" ? "Live" : "Indexed"} ${source.label} (${source.system}): ${source.detail}`),
  ];
  if (dossier.anomalies.length) {
    lines.push("", "Findings:");
    for (const anomaly of dossier.anomalies) {
      lines.push(`- [${anomaly.severity}] ${anomaly.title}: ${anomaly.detail}`);
    }
  }
  if (dossier.alarms.length) {
    lines.push("", "NNMi:");
    for (const alarm of dossier.alarms) {
      lines.push(`- [${alarm.severity}] ${alarm.node}${alarm.interface ? ` ${alarm.interface}` : ""}: ${alarm.summary} (${formatRegina(alarm.time)})`);
    }
  }
  if (dossier.changes.length) {
    lines.push("", "Network Automation:");
    for (const change of dossier.changes) {
      lines.push(`- ${change.hostname}: ${change.change.summary} by ${change.change.user} at ${formatRegina(change.change.time)}`);
    }
  }
  lines.push("", "SWAN gathered this evidence before asking for an interpretation.");
  return lines.join("\n");
}

export function summarize(dossier: Dossier): Summary {
  const hostAnomalies = dossier.anomalies.filter((anomaly) => aboutHost(anomaly, dossier));
  const contextAnomalies = dossier.anomalies.filter((anomaly) => !aboutHost(anomaly, dossier));
  const paragraphs = [identity(dossier)];
  const path = pathParagraph(dossier);
  if (path) paragraphs.push(path);
  paragraphs.push(sourceParagraph(dossier));
  if (contextAnomalies.length > 0 && (dossier.queryType === "ip" || dossier.queryType === "mac")) {
    paragraphs.push(`Separately, the VLAN around this address has other evidence. ${contextAnomalies.map((anomaly) => anomaly.detail).join(" ")}`);
  }

  const leading = hostAnomalies.map((anomaly) => ({
    severity: anomaly.severity,
    text: `${anomaly.title}. ${anomaly.detail}`,
  }));
  for (const anomaly of contextAnomalies) {
    leading.push({ severity: anomaly.severity, text: `${anomaly.title}. ${anomaly.detail}` });
  }
  for (const alarm of dossier.alarms) {
    const explained = dossier.anomalies.some((anomaly) => {
      if (anomaly.code === "mac-on-multiple-access-ports" && alarm.macs?.some((mac) => anomaly.macs.includes(mac))) return true;
      if (anomaly.code === "native-vlan-mismatch" && /native vlan/i.test(alarm.summary)) return true;
      if (anomaly.code === "svi-asymmetric" && alarm.vlanIds?.some((vlan) => anomaly.vlanIds.includes(vlan)) && /SVI/i.test(alarm.summary)) return true;
      return false;
    });
    if (explained) continue;
    leading.push({
      severity: alarm.severity,
      text: `NNMi ${alarm.severity} on ${alarm.node}${alarm.interface ? ` ${alarm.interface}` : ""}: ${alarm.summary}`,
    });
  }

  const headlineBase = identity(dossier).split(". ")[0] ?? dossier.title;
  const major = hostAnomalies.find((anomaly) => anomaly.severity === "major" || anomaly.severity === "critical");
  let headline = headlineBase.endsWith(".") ? headlineBase : `${headlineBase}.`;
  if (major?.code === "mac-on-multiple-access-ports") {
    headline = `${headline.replace(/\.$/, "")}. The MAC is learned on more than one access port.`;
  } else if (major && (dossier.queryType === "vlan" || dossier.queryType === "device") && major.code === "native-vlan-mismatch") {
    headline = `${headline.replace(/\.$/, "")}. A trunk in this investigation does not agree on the native VLAN.`;
  }

  return {
    headline,
    paragraphs,
    leading,
    healthy: healthyLines(dossier),
    checks: checksFor(dossier),
    packet: packet(dossier),
  };
}
