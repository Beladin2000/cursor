"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatRegina, ouiVendor } from "@/lib/ip";
import { hostnameFor } from "@/lib/investigate";
import { summarize } from "@/lib/summarize";
import type { Dossier, Severity } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight, Pivot } from "@/components/highlight";
import { Input } from "@/components/ui/input";
import { NA_COMMANDS } from "@/lib/na-commands";
import { cn } from "@/lib/utils";

const toneClass: Record<string, string> = {
  ok: "border-ok/40 text-ok",
  attention: "border-warn/50 text-warn",
  info: "border-signal/40 text-signal",
  neutral: "",
};

const severityClass: Record<Severity, string> = {
  critical: "text-alarm",
  major: "text-alarm",
  minor: "text-warn",
  warning: "text-warn",
  info: "text-signal",
};

function Section({
  title,
  source,
  count,
  empty,
  children,
}: {
  title: string;
  source: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border py-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          {source}
          <span className="px-1.5">·</span>
          {count === 0 ? "none" : count}
        </p>
      </div>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : children}
    </section>
  );
}

function SeverityText({ severity }: { severity: Severity }) {
  return <span className={cn("capitalize", severityClass[severity])}>{severity}</span>;
}

export function DossierView({
  dossier,
  onOpen,
}: {
  dossier: Dossier;
  onOpen: (query: string) => void;
}) {
  const summary = useMemo(() => summarize(dossier), [dossier]);
  const [showSummary, setShowSummary] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ifaceFilter, setIfaceFilter] = useState(dossier.queryType === "vlan" ? "notable" : "all");
  const [configDevice, setConfigDevice] = useState(dossier.configDevices[0]?.device.id ?? "");
  const [arpFilter, setArpFilter] = useState("");

  const interfaces = dossier.interfaces.filter((row) => {
    if (ifaceFilter === "all") return true;
    if (ifaceFilter === "access") return row.iface.mode === "access";
    if (ifaceFilter === "svi") return row.iface.mode === "svi";
    if (ifaceFilter === "native") return row.note.includes("Native");
    return (
      row.iface.mode === "access" ||
      row.iface.mode === "svi" ||
      row.note.includes("Native") ||
      row.note.includes("differs") ||
      row.iface.adminStatus === "down"
    );
  });
  const activeConfig = dossier.configDevices.find((entry) => entry.device.id === configDevice) ?? dossier.configDevices[0];
  const elsewhere = dossier.configHits.filter((hit) => hit.elsewhere);
  const onSubject = dossier.configHits.filter((hit) => !hit.elsewhere);
  const arpNeedle = arpFilter.trim().toLowerCase();
  const filteredArp = dossier.arp.filter((row) => {
    if (!arpNeedle) return true;
    return [row.hostname, row.entry.ip, row.entry.mac, row.entry.interface, row.entry.protocol]
      .join(" ")
      .toLowerCase()
      .includes(arpNeedle);
  });

  async function copyPacket() {
    try {
      await navigator.clipboard.writeText(summary.packet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{dossier.queryType}</p>
          <h2 className="mt-1 font-mono text-2xl font-semibold tracking-tight" aria-live="polite">
            {dossier.title}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{dossier.subtitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {dossier.badges.map((badge) => (
              <Badge key={badge.label} variant="outline" className={toneClass[badge.tone]}>
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setShowSummary((open) => !open)}>
            {showSummary ? "Hide findings" : "Summarize Findings"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void copyPacket()}>
            {copied ? "Copied" : "Copy evidence for Copilot"}
          </Button>
        </div>
      </div>

      <ol className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {dossier.chain.map((node, index) => (
          <li key={`${node.id}-${index}`} className="flex items-stretch gap-2">
            {node.query ? (
              <button
                type="button"
                onClick={() => onOpen(node.query!)}
                className={cn(
                  "w-44 shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-left hover:border-signal/50",
                  node.tone === "attention" && "border-warn/40",
                )}
              >
                <ChainBody node={node} />
              </button>
            ) : (
              <div className="w-44 shrink-0 rounded-lg border border-border bg-card px-3 py-2">
                <ChainBody node={node} />
              </div>
            )}
            {index < dossier.chain.length - 1 ? (
              <span className="self-center text-muted-foreground" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {showSummary ? (
        <section className="mt-5 rounded-xl border border-signal/30 bg-signal/5 p-4">
          <p className="text-xs font-medium tracking-[0.14em] text-signal uppercase">Copilot</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">{summary.headline}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The copied packet is the evidence, not a conclusion. This reading is only a way to scan that same packet.
          </p>
          <div className="mt-4 space-y-3 text-sm leading-6">
            {summary.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          {summary.leading.length > 0 ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Leading issues</h4>
              <ul className="mt-2 space-y-2">
                {summary.leading.map((item) => (
                  <li key={item.text} className="text-sm leading-6">
                    <SeverityText severity={item.severity} />
                    <span className="text-muted-foreground"> — </span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.healthy.length > 0 ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">What agrees</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {summary.healthy.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.checks.length > 0 ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Checks</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {summary.checks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-signal">Structured findings</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-background/70 p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
              {summary.packet}
            </pre>
          </details>
        </section>
      ) : null}

      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <Section title="Devices" source="Correlation index" count={dossier.devices.length} empty="No device in the slice is tied to this query.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Why it is here</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossier.devices.map((row) => (
                  <TableRow key={row.device.id}>
                    <TableCell>
                      <Pivot query={row.device.hostname} onOpen={onOpen}>
                        {row.device.hostname}
                      </Pivot>
                      <div className="text-xs text-muted-foreground">Vendor {row.device.vendor} · Platform {row.device.platform}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.device.siteName}</TableCell>
                    <TableCell>{row.reasons.join(", ")}</TableCell>
                    <TableCell className={row.device.status === "up" ? "text-ok" : "text-warn"}>
                      {row.device.status}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section
            title="Interfaces"
            source="configs_swan"
            count={dossier.interfaces.length}
            empty="No interface is tied to this query."
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[
                ["all", "All"],
                ["notable", "Notable"],
                ["access", "Access"],
                ["svi", "SVI"],
                ["native", "Native"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="xs"
                  variant={ifaceFilter === value ? "default" : "outline"}
                  onClick={() => setIfaceFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {interfaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in this filter.</p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interfaces.map((row) => (
                  <TableRow key={row.iface.id}>
                    <TableCell>
                      <Pivot query={row.hostname} onOpen={onOpen}>{row.hostname}</Pivot>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.iface.name}</TableCell>
                    <TableCell className={row.note.includes("differs") || row.iface.adminStatus === "down" ? "text-warn" : ""}>
                      {row.note || row.iface.mode}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.iface.ip ? (
                        <Pivot query={row.iface.ip} onOpen={onOpen}>
                          {row.iface.ip}/{row.iface.prefix}
                        </Pivot>
                      ) : row.iface.standbyIp ? (
                        <Pivot query={row.iface.standbyIp} onOpen={onOpen}>
                          HSRP {row.iface.standbyIp}
                        </Pivot>
                      ) : (
                        "—"
                      )}
                      {row.iface.neighborDeviceId ? (
                        <div className="text-muted-foreground">
                          to {hostnameFor(row.iface.neighborDeviceId)} {row.iface.neighborInterface}
                        </div>
                      ) : row.iface.description ? (
                        <div className="text-muted-foreground">{row.iface.description}</div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </Section>

          <Section title="VLANs" source="configs_swan" count={dossier.vlans.length} empty="No VLAN is tied to this query.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VLAN</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Devices</TableHead>
                  <TableHead className="text-right">Access</TableHead>
                  <TableHead className="text-right">Trunks</TableHead>
                  <TableHead className="text-right">Native</TableHead>
                  <TableHead className="text-right">SVIs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossier.vlans.map((vlan) => (
                  <TableRow key={`${vlan.vlanId}-${vlan.name}`}>
                    <TableCell>
                      <Pivot query={`vlan ${vlan.vlanId}`} onOpen={onOpen}>{vlan.vlanId}</Pivot>
                    </TableCell>
                    <TableCell>{vlan.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{vlan.devices.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{vlan.accessCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{vlan.trunkCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{vlan.nativeCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{vlan.sviCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="ARP" source="show_swan_facts · show_ip_arp_all" count={dossier.arp.length} empty="No ARP entry references this investigation.">
            <Input
              value={arpFilter}
              onChange={(event) => setArpFilter(event.target.value)}
              placeholder="Filter device, IP, MAC, or interface"
              className="mb-3 h-8 font-mono text-xs md:text-xs"
              aria-label="Filter ARP entries"
            />
            {filteredArp.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in this filter.</p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Protocol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArp.map((row) => (
                  <TableRow key={`${row.hostname}-${row.entry.ip}-${row.entry.mac}`}>
                    <TableCell><Pivot query={row.hostname} onOpen={onOpen}>{row.hostname}</Pivot></TableCell>
                    <TableCell><Pivot query={row.entry.ip} onOpen={onOpen}>{row.entry.ip}</Pivot></TableCell>
                    <TableCell>
                      <Pivot query={row.entry.mac} onOpen={onOpen}>{row.entry.mac}</Pivot>
                      <div className="text-xs text-muted-foreground">{ouiVendor(row.entry.mac)}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.entry.interface}</TableCell>
                    <TableCell className="font-mono text-xs">{row.entry.age}</TableCell>
                    <TableCell className="text-xs">{row.entry.protocol}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </Section>

          <Section title="MAC address table" source="show_swan_facts · show_mac_address_table_all" count={dossier.macs.length} empty="No MAC entry references this investigation.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>VLAN</TableHead>
                  <TableHead>Interface</TableHead>
                  <TableHead>Where</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossier.macs.map((row) => (
                  <TableRow key={`${row.hostname}-${row.entry.interface}-${row.entry.mac}-${row.entry.vlan}`}>
                    <TableCell><Pivot query={row.hostname} onOpen={onOpen}>{row.hostname}</Pivot></TableCell>
                    <TableCell><Pivot query={row.entry.mac} onOpen={onOpen}>{row.entry.mac}</Pivot></TableCell>
                    <TableCell><Pivot query={`vlan ${row.entry.vlan}`} onOpen={onOpen}>{row.entry.vlan}</Pivot></TableCell>
                    <TableCell className="font-mono text-xs">{row.entry.interface}</TableCell>
                    <TableCell className={row.mode === "access" ? "text-foreground" : "text-muted-foreground"}>
                      {row.mode} · {row.entry.type}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Routes" source="Correlation index" count={dossier.routes.length} empty="No indexed route covers this investigation. Default routes are omitted when a longer match exists.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Next hop</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossier.routes.map((row) => (
                  <TableRow key={`${row.hostname}-${row.route.prefix}-${row.route.nextHop}-${row.route.protocol}`}>
                    <TableCell><Pivot query={row.hostname} onOpen={onOpen}>{row.hostname}</Pivot></TableCell>
                    <TableCell>
                      <Pivot query={row.route.prefix} onOpen={onOpen}>{row.route.prefix}</Pivot>
                    </TableCell>
                    <TableCell className="uppercase">{row.route.protocol}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.route.nextHop === "connected" ? "connected" : row.route.nextHop}
                      {row.route.interface ? <div className="text-muted-foreground">{row.route.interface}</div> : null}
                    </TableCell>
                    <TableCell>{row.longest ? "Longest" : "Covering"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Policy" source="configs_swan" count={dossier.policies.length} empty="No policy references this investigation.">
            <div className="space-y-3">
              {dossier.policies.map((row) => (
                <article key={row.policy.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-medium">
                      {row.policy.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{row.policy.kind}</span>
                    </h4>
                    <Pivot query={row.hostname} onOpen={onOpen}>{row.hostname}</Pivot>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{row.policy.summary}</p>
                  <pre className="mt-2 overflow-x-auto font-mono text-xs leading-5 text-foreground/90">
                    <Highlight text={row.policy.text} tokens={dossier.highlightTokens} />
                  </pre>
                </article>
              ))}
            </div>
          </Section>

          <Section
            title="Indexed configuration"
            source="configs_swan"
            count={dossier.configDevices.length + onSubject.length}
            empty="No indexed configuration block is attached. Related lines, if any, are in the next section."
          >
            <p className="mb-3 text-xs text-muted-foreground">
              This text is the nightly configs_swan snapshot. Network Automation, in the live column, is the change: what differed, when, and on which device.
            </p>
            {dossier.configDevices.length > 1 ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {dossier.configDevices.map((entry) => (
                  <Button
                    key={entry.device.id}
                    type="button"
                    size="xs"
                    variant={activeConfig?.device.id === entry.device.id ? "default" : "outline"}
                    onClick={() => setConfigDevice(entry.device.id)}
                  >
                    {entry.device.hostname}
                  </Button>
                ))}
              </div>
            ) : null}
            {activeConfig ? (
              <div className="max-h-96 overflow-auto rounded-lg border border-border bg-background/40">
                {activeConfig.lines.map((line, index) => (
                  <div key={`${activeConfig.device.id}-${index}`} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 px-3 py-0.5 font-mono text-xs leading-5 hover:bg-muted/40">
                    <span className="text-right text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="whitespace-pre-wrap">
                      <Highlight text={line || " "} tokens={dossier.highlightTokens} />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {onSubject.length > 0 ? (
              <HitList hits={onSubject} tokens={dossier.highlightTokens} onOpen={onOpen} />
            ) : null}
          </Section>

          <Section
            title="Related evidence elsewhere"
            source="Evidence index"
            count={elsewhere.length}
            empty="No other device's indexed configuration mentions this."
          >
            <HitList hits={elsewhere} tokens={dossier.highlightTokens} onOpen={onOpen} />
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Sources checked</h3>
            <SourceGroup title="Indexed" sources={dossier.sources.filter((source) => source.tier === "indexed")} />
            <SourceGroup title="Live" sources={dossier.sources.filter((source) => source.tier === "live")} />
          </div>

          <LiveCard title="NetBox" system="IP, prefix, VRF, IPAM" empty="No NetBox record in the snapshot.">
            {dossier.netbox.map((card) => (
              <div key={card.title} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <h4 className="font-mono text-sm">{card.title}</h4>
                <dl className="mt-2 space-y-1">
                  {card.rows.map((row) => (
                    <div key={`${card.title}-${row.label}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 text-xs">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </LiveCard>

          <LiveCard title="DNS lookup" system="Forward and reverse" empty="No DNS record found">
            {dossier.lookups.map((lookup) => (
              <div key={`${lookup.direction}-${lookup.query}`} className="border-t border-border py-2 text-sm first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">{lookup.direction}</span>
                  {lookup.agreesWithCpnr ? null : <span className="text-xs text-warn">Disagrees with CPNR</span>}
                </div>
                <p className="mt-1 break-all font-mono text-xs">{lookup.query}</p>
                <p className="break-all text-muted-foreground">{lookup.answer}</p>
              </div>
            ))}
          </LiveCard>

          <LiveCard title="CPNR" system="DNS records" empty="No CPNR record found">
            {dossier.dns.map((entry) => (
              <div key={`${entry.record.type}-${entry.record.name}`} className="border-t border-border py-2 text-sm first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{entry.record.type}</span>
                  {entry.conflict ? <span className="text-xs text-warn">Disagrees</span> : null}
                </div>
                <p className="mt-1 break-all">{entry.record.name}</p>
                <p className="break-all text-muted-foreground">{entry.record.value}</p>
                <p className="text-xs text-muted-foreground">{entry.record.zone}</p>
              </div>
            ))}
          </LiveCard>

          <LiveCard title="NNMi" system="nnmi/alarms" empty="No open alarm is tied to this investigation.">
            {dossier.alarms.map((alarm) => (
              <article key={alarm.id} className="border-t border-border py-2 first:border-t-0 first:pt-0">
                <p className="text-xs">
                  <SeverityText severity={alarm.severity} />
                  <span className="text-muted-foreground"> · {alarm.state}</span>
                </p>
                <p className="mt-1 text-sm">{alarm.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {alarm.node}
                  {alarm.interface ? ` ${alarm.interface}` : ""} · {formatRegina(alarm.time)}
                </p>
              </article>
            ))}
          </LiveCard>

          <LiveCard title="Network Automation" system="Configuration changes and allowlisted commands" empty="No related configuration change in the snapshot.">
            {dossier.changes.map(({ hostname, change }) => (
              <article key={change.id} className="border-t border-border py-2 first:border-t-0 first:pt-0">
                <p className="text-sm">{change.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hostname} · {change.user} · {formatRegina(change.time)}
                </p>
                <pre className="mt-2 overflow-x-auto font-mono text-xs leading-5">
                  {change.diff.split("\n").map((line) => (
                    <div key={line} className={line.startsWith("+") ? "text-ok" : line.startsWith("-") ? "text-alarm" : ""}>
                      {line}
                    </div>
                  ))}
                </pre>
              </article>
            ))}
            <NaCommands />
          </LiveCard>
          <p className="text-xs leading-5 text-muted-foreground">
            configs_swan and show_swan_facts here are a Region 10 slice of the nightly index. NetBox, DNS, CPNR, NNMi, and Network Automation are the live connectors, filled from that same slice so the walk can be done without those systems attached. In production a DNS lookup is a resolver query, and CPNR is the zone.
          </p>
        </aside>
      </div>
    </div>
  );
}

function ChainBody({ node }: { node: Dossier["chain"][number] }) {
  return (
    <>
      <div className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{node.kind}</div>
      <div className="mt-1 truncate font-mono text-sm">{node.label}</div>
      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{node.detail}</div>
    </>
  );
}

function HitList({
  hits,
  tokens,
  onOpen,
}: {
  hits: Dossier["configHits"];
  tokens: string[];
  onOpen: (query: string) => void;
}) {
  const groups = new Map<string, typeof hits>();
  for (const hit of hits) {
    const list = groups.get(hit.hostname) ?? [];
    list.push(hit);
    groups.set(hit.hostname, list);
  }
  return (
    <div className="mt-3 space-y-4">
      {[...groups.entries()].map(([hostname, group]) => (
        <div key={hostname}>
          <Pivot query={hostname} onOpen={onOpen}>{hostname}</Pivot>
          <ul className="mt-1 space-y-1">
            {group.map((hit) => (
              <li key={`${hit.deviceId}-${hit.line}`} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 font-mono text-xs leading-5">
                <span className="text-right text-muted-foreground tabular-nums">{hit.line}</span>
                <span className="whitespace-pre-wrap">
                  <Highlight text={hit.text} tokens={tokens} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function NaCommands() {
  const [command, setCommand] = useState<(typeof NA_COMMANDS)[number]>(NA_COMMANDS[0]);
  const [ran, setRan] = useState<string | null>(null);
  return (
    <div className="border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Allowlisted show commands. The runner rejects anything outside this list, and it does not return a second copy of the running configuration.
      </p>
      <label className="mt-2 block text-xs text-muted-foreground" htmlFor="na-command">
        Command
      </label>
      <select
        id="na-command"
        value={command}
        onChange={(event) => setCommand(event.target.value as (typeof NA_COMMANDS)[number])}
        className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 font-mono text-xs"
      >
        {NA_COMMANDS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={() => setRan(command)}>
          Run
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setRan(null)}>
          Clear
        </Button>
      </div>
      {ran ? (
        <p className="mt-2 text-xs leading-5 text-warn">
          Backend configuration warning: the Network Automation command path is not configured. SWAN did not send “{ran}”. Set NA_COMMAND_RUNNER to an executable that accepts the device and this allowlisted command.
        </p>
      ) : null}
    </div>
  );
}

function SourceGroup({
  title,
  sources,
}: {
  title: string;
  sources: Dossier["sources"];
}) {
  return (
    <div className="mt-3">
      <h4 className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{title}</h4>
      <ul className="mt-2 space-y-2">
        {sources.map((source) => (
          <li key={source.id} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>{source.label}</span>
              <span className={source.state === "hit" ? "text-signal" : "text-muted-foreground"}>
                {source.state === "hit" ? "Found" : "None"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {source.system}
              <span className="px-1">·</span>
              {source.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LiveCard({
  title,
  system,
  empty,
  children,
}: {
  title: string;
  system: string;
  empty: string;
  children: ReactNode;
}) {
  const list = Array.isArray(children) ? children : [children];
  const present = list.some(Boolean);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Live</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{system}</p>
      <div className="mt-3">{present ? children : <p className="text-sm text-muted-foreground">{empty}</p>}</div>
    </section>
  );
}
