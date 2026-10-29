"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { INDEXED_SOURCES, LIVE_SOURCES, PRODUCTION_INDEX } from "@/lib/ip";
import {
  describeQuery,
  investigate,
  notableAnomalies,
  sliceStats,
  suggest,
} from "@/lib/investigate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DossierView } from "@/components/dossier-view";
import { Highlight } from "@/components/highlight";
import { VlanMatrix } from "@/components/vlan-matrix";

const examples = [
  {
    query: "C9300-REGN10-4C-MGT-1",
    kicker: "Device",
    text: "Vendor, management address, interfaces, VLANs, and configuration that mentions it somewhere else.",
  },
  {
    query: "10.40.24.46",
    kicker: "IP",
    text: "Which device knows it, which MAC and port, then the NetBox prefix, DNS lookup, and CPNR record.",
  },
  {
    query: "02:4c:10:00:02:19",
    kicker: "MAC",
    text: "The same host learned on two access ports, with forward and reverse DNS that disagree.",
  },
  {
    query: "vlan 240",
    kicker: "VLAN",
    text: "Badge VLAN across Building 4C: access ports, SVIs, and a trunk whose native VLAN does not match.",
  },
];

const more = ["10.40.40.15", "10.40.100.50", "10.40.24.0/24", "ntp server"];

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function SwanApp() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const view = params.get("view") === "matrix" ? "matrix" : "investigate";
  const forceConfig = params.get("as") === "config";
  const [draft, setDraft] = useState(query);
  const [syncedQuery, setSyncedQuery] = useState(query);
  const [focused, setFocused] = useState(false);
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    setDraft(query);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = useMemo(() => sliceStats(), []);
  const findings = useMemo(() => notableAnomalies(), []);
  const result = useMemo(() => (query ? investigate(query, forceConfig) : null), [query, forceConfig]);
  const ideas = suggest(draft);
  const kind = describeQuery(draft);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function navigate(next: { q?: string; view?: "investigate" | "matrix"; as?: "config" | null }) {
    const updated = new URLSearchParams(params.toString());
    if (next.q !== undefined) {
      if (next.q) updated.set("q", next.q);
      else updated.delete("q");
      updated.delete("as");
    }
    if (next.view === "matrix") updated.set("view", "matrix");
    if (next.view === "investigate") updated.delete("view");
    if (next.as === "config") updated.set("as", "config");
    if (next.as === null) updated.delete("as");
    const text = updated.toString();
    router.replace(text ? `/?${text}` : "/", { scroll: false });
  }

  function openQuery(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setDraft(trimmed);
    setFocused(false);
    try {
      const recent = JSON.parse(sessionStorage.getItem("swan-recent") ?? "[]") as string[];
      sessionStorage.setItem(
        "swan-recent",
        JSON.stringify([trimmed, ...recent.filter((item) => item !== trimmed)].slice(0, 6)),
      );
    } catch {
      // Recent queries are a convenience. The investigation still runs.
    }
    navigate({ q: trimmed, view: "investigate", as: null });
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,var(--signal)_0%,transparent_58%)] opacity-15" />
      <header className="relative border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Mark />
            <div>
              <div className="flex items-baseline gap-2">
                <button type="button" onClick={() => navigate({ q: "", view: "investigate", as: null })} className="text-lg font-semibold tracking-tight">
                  SWAN
                </button>
                <span className="font-mono text-xs text-muted-foreground">V20.3.2</span>
              </div>
              <p className="text-xs text-muted-foreground">SWAN Operational Correlation Engine</p>
            </div>
          </div>
          <nav className="flex gap-2" aria-label="Views">
            <Button
              type="button"
              variant={view === "investigate" ? "default" : "outline"}
              onClick={() => navigate({ view: "investigate" })}
              aria-current={view === "investigate" ? "page" : undefined}
            >
              Investigate
            </Button>
            <Button
              type="button"
              variant={view === "matrix" ? "default" : "outline"}
              onClick={() => navigate({ view: "matrix" })}
              aria-current={view === "matrix" ? "page" : undefined}
            >
              VLAN matrix
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            openQuery(draft);
          }}
        >
          <label htmlFor="swan-query" className="text-sm font-medium">
            Investigate a device, IP, MAC, or VLAN
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Input
                id="swan-query"
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => window.setTimeout(() => setFocused(false), 120)}
                placeholder="C9300-REGN10-4C-MGT-1, 10.40.24.46, or VLAN 240"
                className="h-11 pr-28 font-mono text-sm md:text-sm"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {kind ? (
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                  {kind}
                </span>
              ) : null}
              {focused && draft.trim() && ideas.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {ideas.map((idea) => (
                    <li key={`${idea.type}-${idea.query}`}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => openQuery(idea.query)}
                        className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
                      >
                        <span>
                          <span className="block font-mono text-sm">{idea.label}</span>
                          <span className="block text-xs text-muted-foreground">{idea.detail}</span>
                        </span>
                        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{idea.type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Button type="submit" className="h-11">
              Investigate
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Press / to focus search. Enter what you know; SWAN follows what is connected to it.</p>
        </form>

        {view === "matrix" ? <VlanMatrix onOpen={openQuery} /> : null}

        {view === "investigate" && result?.kind === "dossier" ? (
          <DossierView key={result.dossier.query} dossier={result.dossier} onOpen={openQuery} />
        ) : null}

        {view === "investigate" && result?.kind === "choose-device" ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Several devices match “{result.query}”</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the device to open its investigation.
              {result.configHits > 0 ? ` ${result.configHits} configuration lines also contain this text.` : ""}
            </p>
            {result.configHits > 0 ? (
              <Button type="button" variant="outline" className="mt-3" onClick={() => navigate({ as: "config" })}>
                Search configuration text instead
              </Button>
            ) : null}
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
              {result.devices.map((device) => (
                <li key={device.id}>
                  <button
                    type="button"
                    onClick={() => openQuery(device.hostname)}
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      <span className="block font-mono text-sm">{device.hostname}</span>
                      <span className="text-xs text-muted-foreground">{device.vendor} {device.platform} · {device.siteName}</span>
                    </span>
                    <span className="font-mono text-xs text-signal">{device.mgmtIp}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view === "investigate" && result?.kind === "config-search" ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Configuration search</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.total === 0
                ? `No indexed line contains “${result.query}”.`
                : `${result.total} lines contain “${result.query}”.`}
              {result.truncated ? " Showing the first matches on each device." : ""}
            </p>
            <div className="mt-4 space-y-5">
              {result.groups.map((group) => (
                <article key={group.device.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <button type="button" className="font-mono text-sm text-signal hover:underline" onClick={() => openQuery(group.device.hostname)}>
                      {group.device.hostname}
                    </button>
                    <span className="text-xs text-muted-foreground">{group.device.siteName}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {group.hits.map((hit) => (
                      <li key={hit.line} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 font-mono text-xs leading-5">
                        <span className="text-right text-muted-foreground tabular-nums">{hit.line}</span>
                        <span className="whitespace-pre-wrap">
                          <Highlight text={hit.text} tokens={[result.query]} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {view === "investigate" && result?.kind === "short" ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Enter a device, IP, MAC, VLAN, or at least two characters of configuration text.
          </p>
        ) : null}

        {view === "investigate" && !query ? <Home stats={stats} findings={findings} onOpen={openQuery} /> : null}
      </main>
    </div>
  );
}

function Home({
  stats,
  findings,
  onOpen,
}: {
  stats: ReturnType<typeof sliceStats>;
  findings: ReturnType<typeof notableAnomalies>;
  onOpen: (query: string) => void;
}) {
  return (
    <div className="mt-8 space-y-8">
      <section>
        <h2 className="text-sm font-medium text-muted-foreground">Start from what you know</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {examples.map((example) => (
            <button
              key={example.query}
              type="button"
              onClick={() => onOpen(example.query)}
              className="rounded-xl border border-border bg-card p-4 text-left hover:border-signal/50"
            >
              <span className="text-[10px] tracking-[0.14em] text-signal uppercase">{example.kicker}</span>
              <span className="mt-1 block font-mono text-sm">{example.query}</span>
              <span className="mt-2 block text-sm text-muted-foreground">{example.text}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {more.map((item) => (
            <Button key={item} type="button" variant="outline" size="sm" onClick={() => onOpen(item)}>
              {item}
            </Button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Worth a look in this slice</h2>
          <Badge variant="outline">{findings.length} correlation findings</Badge>
        </div>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {findings.map((finding) => (
            <li key={finding.id}>
              <button
                type="button"
                onClick={() => onOpen(finding.query)}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between"
              >
                <span>
                  <span className="block text-sm font-medium">{finding.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground line-clamp-3">{finding.detail}</span>
                </span>
                <span className={finding.severity === "major" ? "text-xs text-alarm" : "text-xs text-warn"}>
                  {finding.severity}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Indexed nightly</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            These are what make a search fast. The pipeline clones them, builds the correlation index, and SWAN reads that index first.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {INDEXED_SOURCES.map((source) => (
            <article key={source.id} className="rounded-xl border border-border p-4">
              <h3 className="font-mono text-sm">{source.name}</h3>
              <p className="mt-1 break-all font-mono text-[11px] text-signal">{source.repo}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{source.detail}</p>
            </article>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 sm:grid-cols-4">
          <Stat label="configs_swan devices" value={PRODUCTION_INDEX.devices} />
          <Stat label="Configuration records" value={PRODUCTION_INDEX.configRecords} />
          <Stat label="Search chunks" value={PRODUCTION_INDEX.searchChunks} />
          <Stat label="ARP records" value={PRODUCTION_INDEX.arp} />
          <Stat label="MAC records" value={PRODUCTION_INDEX.mac} />
          <Stat label="IP correlations" value={PRODUCTION_INDEX.ipCorrelations} />
          <Stat label="MAC correlations" value={PRODUCTION_INDEX.macCorrelations} />
          <Stat label="Device correlations" value={PRODUCTION_INDEX.deviceCorrelations} />
          <Stat label="Operational devices" value={PRODUCTION_INDEX.operationalDevices} />
          <Stat label="Routes" value={PRODUCTION_INDEX.routes} />
          <Stat label="Policies" value={PRODUCTION_INDEX.policies} />
          <Stat label="Evidence IPs" value={PRODUCTION_INDEX.evidenceIps} />
          <Stat label="Evidence devices" value={PRODUCTION_INDEX.evidenceDevices} />
          <Stat label="Evidence VLANs" value={PRODUCTION_INDEX.evidenceVlans} />
        </dl>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li><span className="font-mono text-xs text-foreground">build_index.py</span> reads configs_swan into manifest.json and the search chunks.</li>
          <li><span className="font-mono text-xs text-foreground">build_arp_index.py</span> and <span className="font-mono text-xs text-foreground">build_mac_index.py</span> read show_swan_facts, then the indexes are normalized to arrays.</li>
          <li><span className="font-mono text-xs text-foreground">build_correlation_index.py</span>, <span className="font-mono text-xs text-foreground">build_operational_index.py</span>, and <span className="font-mono text-xs text-foreground">build_evidence_index.py</span> write the indexes under public/data.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          {PRODUCTION_INDEX.label}. This workspace loads a Region 10 slice of that index: {formatCount(stats.devices)} devices, {formatCount(stats.configRecords)} configuration lines, {formatCount(stats.arp)} ARP entries, {formatCount(stats.mac)} MAC entries.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Live, when the investigation needs them</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          These are not part of the nightly configuration index. SWAN calls them to add context the index cannot: source of truth, the current name, monitoring, and what changed.
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {LIVE_SOURCES.map((source) => (
            <li key={source.id} className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">{source.name}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{source.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Give SWAN one identifier — a device, IP, MAC, or VLAN — and it walks the indexed configuration, ARP, and MAC tables, then the correlation index, then the live systems. Summarize Findings reads that evidence. It does not start from a name alone.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg tabular-nums">{formatCount(value)}</dd>
    </div>
  );
}

function Mark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden className="shrink-0">
      <rect width="36" height="36" rx="10" className="fill-card stroke-border" strokeWidth="1" />
      <circle cx="9" cy="18" r="2.2" className="fill-signal" />
      <circle cx="18" cy="10" r="2.2" className="fill-signal" />
      <circle cx="18" cy="26" r="2.2" className="fill-warn" />
      <circle cx="27" cy="18" r="2.2" className="fill-signal" />
      <path d="M11 18h5M18 12v12M20 18h5" className="stroke-signal" strokeWidth="1.4" />
    </svg>
  );
}
