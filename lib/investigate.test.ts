import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeMac, prefixContains } from "./ip";
import { investigate, sliceStats } from "./investigate";
import { summarize } from "./summarize";

function dossier(query: string) {
  const result = investigate(query);
  assert.equal(result.kind, "dossier");
  if (result.kind !== "dossier") throw new Error("expected dossier");
  return result.dossier;
}

describe("address math", () => {
  it("matches a prefix and a Cisco MAC", () => {
    assert.equal(prefixContains("10.40.24.0/24", "10.40.24.46"), true);
    assert.equal(prefixContains("10.40.24.0/24", "10.40.40.15"), false);
    assert.equal(prefixContains("10.40.100.0/23", "10.40.101.20"), true);
    assert.equal(normalizeMac("0240.2412.448a"), "02:40:24:12:44:8a");
  });
});

describe("device investigation", () => {
  it("assembles the management switch and evidence elsewhere", () => {
    const result = dossier("C9300-REGN10-4C-MGT-1");
    assert.equal(result.title, "C9300-REGN10-4C-MGT-1");
    assert.equal(result.devices[0]?.device.mgmtIp, "10.40.8.14");
    assert.ok(result.interfaces.length > 5);
    assert.ok(result.vlans.some((vlan) => vlan.vlanId === 10));
    assert.ok(result.configHits.some((hit) => hit.elsewhere && hit.text.includes("10.40.8.14")));
    assert.ok(result.changes.some((change) => change.change.summary.includes("SNMP")));
    const summary = summarize(result);
    assert.match(summary.packet, /10\.40\.8\.14/);
    assert.match(summary.headline, /C9300-REGN10-4C-MGT-1/);
  });
});

describe("IP investigation", () => {
  it("correlates the badge reader from ARP to port, VLAN, and live sources", () => {
    const result = dossier("10.40.24.46");
    assert.equal(result.arp[0]?.entry.mac, "02:40:24:12:44:8a");
    assert.ok(result.arp.some((row) => row.hostname === "C9500-REGN10-4C-DIST-1"));
    const access = result.macs.find((row) => row.mode === "access");
    assert.equal(access?.hostname, "C9300-REGN10-4C-ACC-2");
    assert.equal(access?.entry.interface, "GigabitEthernet1/0/18");
    assert.equal(access?.entry.vlan, 240);
    assert.ok(result.netbox.some((card) => card.rows.some((row) => row.value === "badge-reader-4c-e12")));
    assert.ok(result.netbox.some((card) => card.rows.some((row) => row.label === "VRF" && row.value === "default")));
    assert.ok(result.netbox.some((card) => card.title === "10.40.24.0/24"));
    assert.ok(result.lookups.some((lookup) => lookup.direction === "reverse" && lookup.answer === "badge-4c-east.regn10.swan.net" && lookup.agreesWithCpnr));
    assert.ok(result.dns.some((entry) => entry.record.system === "cpnr" && entry.record.name === "badge-4c-east.regn10.swan.net" && !entry.conflict));
    assert.ok(result.dns.some((entry) => entry.record.type === "PTR" && entry.record.value === "badge-4c-east.regn10.swan.net"));
    assert.ok(result.sources.some((source) => source.id === "config" && source.tier === "indexed" && source.system === "configs_swan"));
    assert.ok(result.sources.some((source) => source.id === "arp" && source.system === "show_swan_facts" && source.state === "hit"));
    assert.ok(result.sources.some((source) => source.id === "cpnr" && source.tier === "live" && source.state === "hit"));
    assert.ok(result.policies.some((row) => row.policy.name === "badge-auth"));
    assert.ok(result.routes.some((row) => row.route.prefix === "10.40.24.0/24" && row.longest));
    assert.ok(result.anomalies.some((anomaly) => anomaly.code === "native-vlan-mismatch"));
    assert.equal(result.anomalies.some((anomaly) => anomaly.code === "mac-on-multiple-access-ports"), false);
    const summary = summarize(result);
    assert.match(summary.headline, /10\.40\.24\.46/);
    assert.match(summary.paragraphs.join(" "), /GigabitEthernet1\/0\/18/);
    assert.match(summary.paragraphs.join(" "), /does not have a flow record/);
    assert.match(summary.paragraphs.join(" "), /Separately/);
    assert.match(summary.paragraphs.join(" "), /native VLAN 240/);
  });

  it("keeps the VLAN 240 mismatch off an unrelated host", () => {
    const result = dossier("10.40.100.50");
    assert.ok(result.anomalies.some((anomaly) => anomaly.code === "mac-on-multiple-access-ports"));
    assert.ok(result.anomalies.some((anomaly) => anomaly.code === "dns-mismatch"));
    assert.ok(result.lookups.some((lookup) => lookup.direction === "reverse" && lookup.answer === "workstation-4c-old.regn10.swan.net" && !lookup.agreesWithCpnr));
    assert.equal(result.anomalies.some((anomaly) => anomaly.code === "native-vlan-mismatch"), false);
    const ports = result.macs.filter((row) => row.mode === "access").map((row) => row.hostname);
    assert.ok(ports.includes("C9300-REGN10-4C-ACC-2"));
    assert.ok(ports.includes("C9300-REGN10-4C-ACC-4"));
    const summary = summarize(result);
    assert.match(summary.headline, /more than one access port/);
    assert.match(summary.paragraphs.join(" "), /workstation-4c-old\.regn10\.swan\.net/);
  });

  it("shows a reserved printer that policy mentions and ARP does not", () => {
    const result = dossier("10.40.40.15");
    assert.equal(result.arp.length, 0);
    assert.ok(result.netbox.some((card) => card.rows.some((row) => row.value === "reserved")));
    assert.ok(result.policies.some((row) => row.policy.name === "print-scan-to-email"));
    assert.ok(result.anomalies.some((anomaly) => anomaly.code === "policy-without-arp"));
    assert.ok(result.anomalies.some((anomaly) => anomaly.code === "svi-asymmetric"));
    assert.ok(result.interfaces.some((row) => row.iface.name === "GigabitEthernet1/0/20" && row.iface.adminStatus === "down"));
  });

  it("treats the badge gateway as HSRP", () => {
    const result = dossier("10.40.24.1");
    assert.match(result.subtitle, /HSRP|VLAN 240|DIST/i);
    const summary = summarize(result);
    assert.match(summary.paragraphs[0], /HSRP/);
  });

  it("reports an address the slice has never seen", () => {
    const result = dossier("10.99.1.5");
    assert.equal(result.arp.length, 0);
    assert.equal(result.netbox.length, 0);
    assert.ok(result.sources.every((source) => source.state === "clear" || source.id === "route"));
  });
});

describe("MAC, VLAN, prefix, and configuration search", () => {
  it("opens a MAC written in Cisco notation", () => {
    const result = dossier("0240.2412.448a");
    assert.equal(result.queryType, "mac");
    assert.equal(result.title, "02:40:24:12:44:8a");
    assert.ok(result.arp.some((row) => row.entry.ip === "10.40.24.46"));
  });

  it("shows the native VLAN mismatch on VLAN 240 and not on a quiet VLAN", () => {
    const vlan = dossier("vlan 240");
    assert.ok(vlan.anomalies.some((anomaly) => anomaly.code === "native-vlan-mismatch"));
    assert.ok(vlan.interfaces.some((row) => row.note.includes("Native differs")));
    const voice = dossier("200");
    assert.equal(voice.anomalies.some((anomaly) => anomaly.code === "native-vlan-mismatch"), false);
  });

  it("includes the Region 07 aggregate when the badge prefix is investigated", () => {
    const result = dossier("10.40.24.0/24");
    assert.ok(result.routes.some((row) => row.hostname === "C9500-REGN10-4C-DIST-1" && row.route.protocol === "connected"));
    assert.ok(result.routes.some((row) => row.hostname === "ASR1001-REGN07-CORE-1" && row.route.prefix === "10.40.0.0/16"));
  });

  it("groups a configuration search and asks when several devices match", () => {
    const config = investigate("ntp server");
    assert.equal(config.kind, "config-search");
    if (config.kind !== "config-search") return;
    assert.ok(config.total > 5);
    assert.ok(config.groups.some((group) => group.device.hostname === "C9300-REGN10-4C-MGT-1"));
    const choice = investigate("C9300");
    assert.equal(choice.kind, "choose-device");
    if (choice.kind !== "choose-device") return;
    assert.ok(choice.devices.length > 3);
  });
});

describe("slice", () => {
  it("loads a correlated set of devices", () => {
    const stats = sliceStats();
    assert.equal(stats.devices, 20);
    assert.ok(stats.arp > 20);
    assert.ok(stats.mac > stats.arp);
    assert.ok(stats.configRecords > 200);
  });
});
