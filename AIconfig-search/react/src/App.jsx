import { useEffect, useMemo, useState } from "react";
import { LiveOperationalTools } from "./components/LiveOperationalTools.jsx";
import { OperationalArpTable } from "./components/OperationalArpTable.jsx";
import { VlanMatrix } from "./components/VlanMatrix.jsx";

const examples = [
  {
    query: "C9300-REGN10-4C-MGT-1",
    kicker: "Device",
    text: "Vendor, platform, management address, interfaces, VLANs, and configuration that mentions it somewhere else.",
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

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    view: params.get("view") === "matrix" ? "matrix" : "investigate",
    asConfig: params.get("as") === "config",
  };
}

function formatCount(value) {
  return Number(value).toLocaleString("en-US");
}

function highlight(text, tokens) {
  const usable = [...new Set((tokens ?? []).filter((token) => token && String(token).length >= 2))];
  if (!usable.length) return text;
  const pattern = new RegExp(`(${usable.map((token) => String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  const parts = String(text).split(pattern);
  return parts.map((part, index) =>
    usable.some((token) => token.toLowerCase() === part.toLowerCase()) ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  );
}

export default function App() {
  const [location, setLocation] = useState(readLocation);
  const [draft, setDraft] = useState(location.q);
  const [focused, setFocused] = useState(false);
  const [home, setHome] = useState(null);
  const [homeError, setHomeError] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [kind, setKind] = useState(null);
  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState(location.q ? "loading" : "idle");
  const [error, setError] = useState("");

  useEffect(() => {
    function onPop() {
      const next = readLocation();
      setLocation(next);
      setDraft(next.q);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        event.preventDefault();
        document.getElementById("swan-query")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/home")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setHome(payload);
      })
      .catch(() => {
        if (!cancelled) setHomeError("The investigation API is not answering. Start api_server.py and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const text = draft.trim();
      if (!text) {
        setIdeas([]);
        setKind(null);
        return;
      }
      fetch(`/api/suggest?q=${encodeURIComponent(text)}`)
        .then((response) => response.json())
        .then((payload) => {
          setIdeas(payload.suggestions ?? []);
          setKind(payload.kind);
        })
        .catch(() => {
          setIdeas([]);
        });
    }, 120);
    return () => window.clearTimeout(handle);
  }, [draft]);

  useEffect(() => {
    if (!location.q || location.view === "matrix") {
      setPhase("idle");
      setResult(null);
      setError("");
      return undefined;
    }
    let cancelled = false;
    setPhase("loading");
    setError("");
    const params = new URLSearchParams({ q: location.q });
    if (location.asConfig) params.set("as", "config");
    fetch(`/api/investigate?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) {
          setResult(payload);
          setPhase("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("error");
          setError("This investigation did not return. The API on port 4183 did not answer.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [location.q, location.view, location.asConfig]);

  function navigate(next) {
    const params = new URLSearchParams(window.location.search);
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
      params.delete("as");
    }
    if (next.view === "matrix") params.set("view", "matrix");
    if (next.view === "investigate") params.delete("view");
    if (next.as === "config") params.set("as", "config");
    if (next.as === null) params.delete("as");
    const text = params.toString();
    window.history.pushState(null, "", text ? `/?${text}` : "/");
    const updated = readLocation();
    setLocation(updated);
    if (next.q !== undefined) setDraft(updated.q);
  }

  function openQuery(value) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setFocused(false);
    navigate({ q: trimmed, view: "investigate", as: null });
  }

  return (
    <div className="app">
      <div className="glow" />
      <header className="header">
        <div className="bar">
          <button type="button" className="brand" onClick={() => navigate({ q: "", view: "investigate", as: null })}>
            <Mark />
            <span>
              <strong>
                SWAN <span className="version">V20.3.5</span>
              </strong>
              <p className="tagline">SWAN Operational Correlation Engine</p>
            </span>
          </button>
          <nav className="nav" aria-label="Views">
            <button type="button" className="btn-ghost" aria-current={location.view === "investigate" ? "page" : undefined} onClick={() => navigate({ view: "investigate" })}>
              Investigate
            </button>
            <button type="button" className="btn-ghost" aria-current={location.view === "matrix" ? "page" : undefined} onClick={() => navigate({ view: "matrix" })}>
              VLAN matrix
            </button>
          </nav>
        </div>
      </header>
      <main className="main">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            openQuery(draft);
          }}
        >
          <label htmlFor="swan-query">Investigate a device, IP, MAC, or VLAN</label>
          <div className="search">
            <div className="field">
              <input
                id="swan-query"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => window.setTimeout(() => setFocused(false), 150)}
                placeholder="C9300-REGN10-4C-MGT-1, 10.40.24.46, or VLAN 240"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {kind ? <span className="kind">{kind}</span> : null}
              {focused && ideas.length > 0 ? (
                <ul className="suggest">
                  {ideas.map((idea) => (
                    <li key={`${idea.type}-${idea.query}`}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => openQuery(idea.query)}
                      >
                        <span>
                          <span className="mono">{idea.label}</span>
                          <span className="hint">{idea.detail}</span>
                        </span>
                        <span className="kicker">{idea.type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="submit" className="btn">
              Investigate
            </button>
          </div>
          <p className="hint">Press / to focus search. Enter what you know; SWAN follows what is connected to it.</p>
        </form>

        {homeError ? <p className="error">{homeError}</p> : null}
        {location.view === "matrix" ? <VlanMatrix onOpen={openQuery} /> : null}
        {location.view === "investigate" && phase === "loading" ? <p className="banner">Correlating the index for “{location.q}”.</p> : null}
        {location.view === "investigate" && phase === "error" ? <p className="error">{error}</p> : null}
        {location.view === "investigate" && phase === "ready" && result?.kind === "dossier" ? (
          <Dossier result={result} onOpen={openQuery} />
        ) : null}
        {location.view === "investigate" && phase === "ready" && result?.kind === "choose-device" ? (
          <section className="stack">
            <h2>Several devices match “{result.query}”</h2>
            <p className="muted">
              Choose the device to open its investigation.
              {result.configHits > 0 ? ` ${result.configHits} configuration lines also contain this text.` : ""}
            </p>
            {result.configHits > 0 ? (
              <button type="button" className="btn-ghost" onClick={() => navigate({ as: "config" })}>
                Search configuration text instead
              </button>
            ) : null}
            <ul className="choice">
              {result.devices.map((device) => (
                <li key={device.id}>
                  <button type="button" onClick={() => openQuery(device.hostname)}>
                    <span>
                      <span className="mono">{device.hostname}</span>
                      <span className="hint">
                        Vendor {device.vendor} · Platform {device.platform} · {device.siteName}
                      </span>
                    </span>
                    <span className="mono signal">{device.mgmtIp}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {location.view === "investigate" && phase === "ready" && result?.kind === "config-search" ? (
          <ConfigSearch result={result} onOpen={openQuery} />
        ) : null}
        {location.view === "investigate" && phase === "ready" && result?.kind === "short" ? (
          <p className="muted">Enter a device, IP, MAC, VLAN, or at least two characters of configuration text.</p>
        ) : null}
        {location.view === "investigate" && !location.q ? <Home home={home} onOpen={openQuery} /> : null}
      </main>
    </div>
  );
}

function Home({ home, onOpen }) {
  const index = home?.productionIndex;
  return (
    <div>
      <section className="stack">
        <h2 className="muted">Start from what you know</h2>
        <div className="cards">
          {examples.map((example) => (
            <button key={example.query} type="button" className="card" onClick={() => onOpen(example.query)}>
              <span className="kicker">{example.kicker}</span>
              <span className="mono">{example.query}</span>
              <p>{example.text}</p>
            </button>
          ))}
        </div>
        <div className="chips">
          {more.map((item) => (
            <button key={item} type="button" className="btn-ghost small" onClick={() => onOpen(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>
      <section className="stack">
        <h2 className="muted">Worth a look in this slice</h2>
        {!home ? <p className="banner">Loading correlation findings.</p> : null}
        {home ? (
          <ul className="list">
            {home.findings.map((finding) => (
              <li key={finding.id}>
                <button type="button" className="row-btn" onClick={() => onOpen(finding.query)}>
                  <span>
                    <strong>{finding.title}</strong>
                    <span className="hint">{finding.detail}</span>
                  </span>
                  <span className={finding.severity === "major" ? "major" : "warning"}>{finding.severity}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="stack">
        <h2>Indexed nightly</h2>
        <p className="muted">
          {home?.pipeline?.indexed ?? "These are what make a search fast. The pipeline clones them, builds the correlation index, and SWAN reads that index first."}
        </p>
        {home?.pipeline?.live ? <p className="muted">{home.pipeline.live}</p> : null}
        <div className="source-grid">
          {(home?.indexedSources ?? []).map((source) => (
            <article key={source.id} className="panel">
              <h3 className="mono">{source.name}</h3>
              <p className="mono signal">{source.repo}</p>
              <p>{source.detail}</p>
            </article>
          ))}
        </div>
        {index ? (
          <dl className="stats panel">
            <Stat label="configs_swan devices" value={index.devices} />
            <Stat label="Configuration records" value={index.configRecords} />
            <Stat label="Search chunks" value={index.searchChunks} />
            <Stat label="ARP records" value={index.arp} />
            <Stat label="MAC records" value={index.mac} />
            <Stat label="IP correlations" value={index.ipCorrelations} />
            <Stat label="MAC correlations" value={index.macCorrelations} />
            <Stat label="Device correlations" value={index.deviceCorrelations} />
            <Stat label="Operational devices" value={index.operationalDevices} />
            <Stat label="Routes" value={index.routes} />
            <Stat label="Policies" value={index.policies} />
            <Stat label="Evidence IPs" value={index.evidenceIps} />
            <Stat label="Evidence devices" value={index.evidenceDevices} />
            <Stat label="Evidence VLANs" value={index.evidenceVlans} />
          </dl>
        ) : null}
        <ol className="steps">
          <li>
            <code>build_index.py</code> reads configs_swan into manifest.json and the search chunks.
          </li>
          <li>
            <code>build_arp_index.py</code> and <code>build_mac_index.py</code> read show_swan_facts, then the indexes are normalized to arrays.
          </li>
          <li>
            <code>build_correlation_index.py</code>, <code>build_operational_index.py</code>, and <code>build_evidence_index.py</code> write the indexes under public/data.
          </li>
        </ol>
        {home ? (
          <p className="hint">
            {index?.label}. This workspace loads a Region 10 slice of that index: {formatCount(home.stats.devices)} devices, {formatCount(home.stats.configRecords)} configuration lines, {formatCount(home.stats.arp)} ARP entries, {formatCount(home.stats.mac)} MAC entries.
          </p>
        ) : null}
      </section>
      <section className="stack">
        <h2>Live, when the investigation needs them</h2>
        <p className="muted">These are not part of the nightly configuration index. SWAN calls them to add context the index cannot.</p>
        <ul className="source-grid">
          {(home?.liveSources ?? []).map((source) => (
            <li key={source.id} className="panel">
              <h3>{source.name}</h3>
              <p>{source.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="hint">{label}</dt>
      <dd className="mono">{formatCount(value)}</dd>
    </div>
  );
}

function Dossier({ result, onOpen }) {
  const dossier = result.dossier;
  const summary = result.summary;
  const [showSummary, setShowSummary] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ifaceFilter, setIfaceFilter] = useState(dossier.queryType === "vlan" ? "notable" : "all");
  const [configDevice, setConfigDevice] = useState(dossier.configDevices[0]?.device.id ?? "");
  const device = dossier.devices.find((row) => row.device.hostname === dossier.title)?.device;
  const interfaces = dossier.interfaces.filter((row) => {
    if (ifaceFilter === "all") return true;
    if (ifaceFilter === "access") return row.iface.mode === "access";
    if (ifaceFilter === "svi") return row.iface.mode === "svi";
    if (ifaceFilter === "native") return row.note.includes("Native");
    return row.iface.mode === "access" || row.iface.mode === "svi" || row.note.includes("Native") || row.note.includes("differs") || row.iface.adminStatus === "down";
  });
  const activeConfig = dossier.configDevices.find((entry) => entry.device.id === configDevice) ?? dossier.configDevices[0];
  const elsewhere = dossier.configHits.filter((hit) => hit.elsewhere);

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
    <div className="stack">
      <div className="head">
        <div>
          <p className="kicker">{dossier.queryType}</p>
          <h2 className="mono" aria-live="polite">
            {dossier.title}
          </h2>
          <p className="muted">{dossier.subtitle}</p>
          {device ? (
            <p>
              Vendor {device.vendor} · Platform {device.platform}
            </p>
          ) : null}
          <div className="badges">
            {dossier.badges.map((badge) => (
              <span key={badge.label} className={`badge tone-${badge.tone}`}>
                {badge.label}
              </span>
            ))}
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setShowSummary((open) => !open)}>
            {showSummary ? "Hide findings" : "Summarize Findings"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => void copyPacket()}>
            {copied ? "Copied" : "Copy evidence for Copilot"}
          </button>
        </div>
      </div>
      <ol className="chain">
        {dossier.chain.map((node, index) => (
          <li key={`${node.id}-${index}`}>
            {node.query ? (
              <button type="button" className={node.tone === "attention" ? "attention" : ""} onClick={() => onOpen(node.query)}>
                <ChainBody node={node} />
              </button>
            ) : (
              <article className={node.tone === "attention" ? "attention" : ""}>
                <ChainBody node={node} />
              </article>
            )}
            {index < dossier.chain.length - 1 ? <span className="arrow">→</span> : null}
          </li>
        ))}
      </ol>
      {showSummary ? (
        <section className="summary">
          <p className="kicker">Copilot</p>
          <h3>{summary.headline}</h3>
          <p className="hint">The copied packet is the evidence, not a conclusion. This reading is only a way to scan that same packet.</p>
          {summary.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {summary.leading.length > 0 ? (
            <>
              <h4>Leading issues</h4>
              <ul>
                {summary.leading.map((item) => (
                  <li key={item.text}>
                    <span className={item.severity === "major" || item.severity === "critical" ? "major" : "warning"}>{item.severity}</span> — {item.text}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {summary.healthy.length > 0 ? (
            <>
              <h4>Holding</h4>
              <ul>
                {summary.healthy.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
          {summary.checks.length > 0 ? (
            <>
              <h4>Checks</h4>
              <ul>
                {summary.checks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
      <div className="layout">
        <div>
          <Section title="Devices" source="Correlation index" count={dossier.devices.length} empty="No device in the slice is tied to this query.">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>Vendor</th>
                    <th>Platform</th>
                    <th>Management IP</th>
                    <th>Why it is here</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.devices.map((row) => (
                    <tr key={row.device.id}>
                      <td>
                        <button type="button" className="linkish signal" onClick={() => onOpen(row.device.hostname)}>
                          {row.device.hostname}
                        </button>
                      </td>
                      <td>{row.device.vendor}</td>
                      <td>{row.device.platform}</td>
                      <td className="mono">{row.device.mgmtIp}</td>
                      <td>{row.reasons.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Interfaces" source="configs_swan" count={dossier.interfaces.length} empty="No interface is tied to this query.">
            <div className="filters">
              {[
                ["all", "All"],
                ["notable", "Notable"],
                ["access", "Access"],
                ["svi", "SVI"],
                ["native", "Native"],
              ].map(([value, label]) => (
                <button key={value} type="button" className={ifaceFilter === value ? "btn small" : "btn-ghost small"} onClick={() => setIfaceFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
            {interfaces.length === 0 ? <p className="muted">No interface matches this filter.</p> : null}
            {interfaces.length > 0 ? (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Interface</th>
                      <th>Mode</th>
                      <th>Address</th>
                      <th>State</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interfaces.map((row) => (
                      <tr key={row.iface.id}>
                        <td className="mono">{row.hostname}</td>
                        <td className="mono">{row.iface.name}</td>
                        <td>{row.iface.mode}</td>
                        <td className="mono">{row.iface.ip ? `${row.iface.ip}${row.iface.prefix ? `/${row.iface.prefix}` : ""}` : row.iface.standbyIp || ""}</td>
                        <td>{row.iface.adminStatus === "down" ? "admin down" : row.iface.operStatus}</td>
                        <td>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Section>
          <Section title="VLANs" source="configs_swan" count={dossier.vlans.length} empty="No VLAN is tied to this query.">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>VLAN</th>
                    <th>Name</th>
                    <th className="num">Access</th>
                    <th className="num">Trunks</th>
                    <th className="num">Native</th>
                    <th className="num">SVIs</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.vlans.map((vlan) => (
                    <tr key={vlan.vlanId}>
                      <td>
                        <button type="button" className="linkish signal" onClick={() => onOpen(`vlan ${vlan.vlanId}`)}>
                          {vlan.vlanId}
                        </button>
                      </td>
                      <td>{vlan.name}</td>
                      <td className="num">{vlan.accessCount}</td>
                      <td className="num">{vlan.trunkCount}</td>
                      <td className="num">{vlan.nativeCount}</td>
                      <td className="num">{vlan.sviCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="ARP" source="show_swan_facts · show_ip_arp_all" count={dossier.arp.length} empty="No ARP entry references this investigation.">
            <OperationalArpTable rows={dossier.arp} />
          </Section>
          <Section title="MAC address table" source="show_swan_facts · show_mac_address_table_all" count={dossier.macs.length} empty="No MAC entry references this investigation.">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>MAC</th>
                    <th>VLAN</th>
                    <th>Interface</th>
                    <th>Mode</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.macs.map((row) => (
                    <tr key={`${row.hostname}-${row.entry.interface}-${row.entry.mac}`}>
                      <td className="mono">{row.hostname}</td>
                      <td>
                        <button type="button" className="linkish mono" onClick={() => onOpen(row.entry.mac)}>
                          {row.entry.mac}
                        </button>
                      </td>
                      <td>{row.entry.vlan}</td>
                      <td className="mono">{row.entry.interface}</td>
                      <td>{row.mode}</td>
                      <td>{row.entry.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Routes" source="Correlation index" count={dossier.routes.length} empty="No indexed route covers this investigation. Default routes are omitted when a longer match exists.">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Prefix</th>
                    <th>Protocol</th>
                    <th>Next hop</th>
                    <th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.routes.map((row) => (
                    <tr key={`${row.hostname}-${row.route.prefix}-${row.route.nextHop}`}>
                      <td className="mono">{row.hostname}</td>
                      <td className="mono">{row.route.prefix}</td>
                      <td>{row.route.protocol}</td>
                      <td className="mono">{row.route.nextHop}</td>
                      <td>{row.longest ? "Longest" : "Covering"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Policy" source="configs_swan" count={dossier.policies.length} empty="No policy references this investigation.">
            {dossier.policies.map((row) => (
              <article key={row.policy.id} className="record">
                <strong>{row.policy.name}</strong>
                <p className="hint">
                  {row.hostname} · {row.policy.kind} · {row.policy.action}
                </p>
                <p>{row.policy.summary}</p>
              </article>
            ))}
          </Section>
          <Section title="Indexed configuration" source="configs_swan nightly snapshot" count={dossier.configDevices.length} empty="No running configuration is attached to the subject of this investigation.">
            {dossier.configDevices.length > 1 ? (
              <select value={activeConfig?.device.id ?? ""} onChange={(event) => setConfigDevice(event.target.value)} aria-label="Configuration device">
                {dossier.configDevices.map((entry) => (
                  <option key={entry.device.id} value={entry.device.id}>
                    {entry.device.hostname}
                  </option>
                ))}
              </select>
            ) : null}
            {activeConfig ? (
              <pre>
                {activeConfig.lines.map((line, index) => (
                  <div key={`${index}-${line}`}>{highlight(line, dossier.highlightTokens)}</div>
                ))}
              </pre>
            ) : null}
            <p className="hint">This is the nightly configs_swan snapshot. Network Automation is the change, not a second running configuration.</p>
          </Section>
          <Section title="Related evidence elsewhere" source="Evidence index" count={elsewhere.length} empty="No other device’s configuration mentions this.">
            <HitList hits={elsewhere} tokens={dossier.highlightTokens} onOpen={onOpen} />
          </Section>
        </div>
        <LiveOperationalTools dossier={dossier} />
      </div>
    </div>
  );
}

function Section({ title, source, count, empty, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{title}</h3>
        <p className="hint">
          {source} · {count === 0 ? "none" : count}
        </p>
      </div>
      {count === 0 ? <p className="muted">{empty}</p> : children}
    </section>
  );
}

function ChainBody({ node }) {
  return (
    <>
      <div className="kicker">{node.kind}</div>
      <div className="mono">{node.label}</div>
      <div className="hint">{node.detail}</div>
    </>
  );
}

function HitList({ hits, tokens, onOpen }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const hit of hits) {
      const list = map.get(hit.hostname) ?? [];
      list.push(hit);
      map.set(hit.hostname, list);
    }
    return [...map.entries()];
  }, [hits]);
  return (
    <div>
      {groups.map(([hostname, group]) => (
        <div key={hostname}>
          <button type="button" className="linkish signal" onClick={() => onOpen(hostname)}>
            {hostname}
          </button>
          {group.map((hit) => (
            <div key={`${hit.deviceId}-${hit.line}`} className="hit">
              <span className="num muted">{hit.line}</span>
              <span>{highlight(hit.text, tokens)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ConfigSearch({ result, onOpen }) {
  return (
    <section className="stack">
      <h2>Configuration search</h2>
      <p className="muted">
        {result.total === 0 ? `No indexed line contains “${result.query}”.` : `${result.total} lines contain “${result.query}”.`}
        {result.truncated ? " Showing the first matches on each device." : ""}
      </p>
      {result.groups.map((group) => (
        <article key={group.device.id} className="config-group">
          <div className="section-head">
            <button type="button" className="linkish signal" onClick={() => onOpen(group.device.hostname)}>
              {group.device.hostname}
            </button>
            <span className="hint">{group.device.siteName}</span>
          </div>
          {group.hits.map((hit) => (
            <div key={hit.line} className="hit">
              <span className="num muted">{hit.line}</span>
              <span>{highlight(hit.text, [result.query])}</span>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

function Mark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="oklch(0.205 0.018 255)" stroke="oklch(0.92 0.01 250 / 12%)" />
      <circle cx="9" cy="18" r="2.2" fill="oklch(0.8 0.11 195)" />
      <circle cx="18" cy="10" r="2.2" fill="oklch(0.8 0.11 195)" />
      <circle cx="18" cy="26" r="2.2" fill="oklch(0.82 0.14 85)" />
      <circle cx="27" cy="18" r="2.2" fill="oklch(0.8 0.11 195)" />
      <path d="M11 18h5M18 12v12M20 18h5" stroke="oklch(0.8 0.11 195)" strokeWidth="1.4" />
    </svg>
  );
}
