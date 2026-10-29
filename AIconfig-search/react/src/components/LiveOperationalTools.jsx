import { useEffect, useState } from "react";
import commands from "../liveCommands.json";

function formatRegina(iso) {
  if (!iso) return "";
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

function SourceGroup({ title, sources }) {
  return (
    <div>
      <h4 className="kicker">{title}</h4>
      <ul className="list">
        {sources.map((source) => (
          <li key={source.id} className="record">
            <div className="section-head">
              <span>{source.label}</span>
              <span className={source.state === "hit" ? "signal" : "muted"}>{source.state === "hit" ? "Found" : "None"}</span>
            </div>
            <p className="hint">
              {source.system} · {source.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LiveOperationalTools({ dossier }) {
  const device = dossier.queryType === "device" ? dossier.title : dossier.devices[0]?.device.hostname ?? "";
  const ip = dossier.queryType === "ip" ? dossier.query : dossier.arp[0]?.entry.ip ?? dossier.devices[0]?.device.mgmtIp ?? "";
  const [live, setLive] = useState({ netbox: null, dns: null, cpnr: null, nnmi: null });
  const [command, setCommand] = useState(commands[0]);
  const [na, setNa] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const query = encodeURIComponent(dossier.query);
    const ipQuery = encodeURIComponent(ip);
    setLive({ netbox: null, dns: null, cpnr: null, nnmi: null });
    Promise.all([
      fetch(`/api/netbox?ip=${ipQuery}`).then((response) => response.json()),
      fetch(`/api/dns?q=${query}`).then((response) => response.json()),
      fetch(`/api/cpnr?q=${query}`).then((response) => response.json()),
      fetch(`/api/nnmi/alarms?q=${query}`).then((response) => response.json()),
    ])
      .then(([netbox, dns, cpnr, nnmi]) => {
        if (!cancelled) setLive({ netbox, dns, cpnr, nnmi });
      })
      .catch(() => {
        if (!cancelled) {
          setLive({
            netbox: { warning: "The live NetBox call failed before it left this browser." },
            dns: { detail: "No DNS record found" },
            cpnr: { warning: "The live CPNR call failed before it left this browser.", detail: "No CPNR record found" },
            nnmi: { warning: "The live NNMi call failed before it left this browser." },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dossier.query, ip]);

  async function runCommand() {
    setRunning(true);
    try {
      const response = await fetch("/api/na/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, command }),
      });
      setNa(await response.json());
    } catch {
      setNa({
        sent: false,
        warning: `Backend configuration warning: the Network Automation command path is not configured. SWAN did not send “${command}”.`,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside className="tools">
      <section className="panel tool">
        <h3>Sources checked</h3>
        <SourceGroup title="Indexed" sources={dossier.sources.filter((source) => source.tier === "indexed")} />
        <SourceGroup title="Live" sources={dossier.sources.filter((source) => source.tier === "live")} />
      </section>

      <section className="panel tool">
        <div className="tools-head">
          <h3>NetBox</h3>
          <span className="kicker">IP, prefix, VRF, IPAM</span>
        </div>
        {dossier.netbox.length === 0 ? <p className="muted">No NetBox record in the snapshot.</p> : null}
        {dossier.netbox.map((card) => (
          <article key={card.title} className="record">
            <h4 className="mono">{card.title}</h4>
            <dl className="kv">
              {card.rows.map((row) => (
                <FragmentRow key={`${card.title}-${row.label}`} label={row.label} value={row.value} />
              ))}
            </dl>
          </article>
        ))}
        <LiveNote pending={!live.netbox} warning={live.netbox?.warning} empty={live.netbox?.empty ? "No NetBox record" : live.netbox?.error} />
        {live.netbox?.hierarchy ? <p className="hint">Live hierarchy {live.netbox.hierarchy}</p> : null}
      </section>

      <section className="panel tool">
        <div className="tools-head">
          <h3>DNS lookup</h3>
          <span className="kicker">Forward and reverse</span>
        </div>
        {dossier.lookups.length === 0 ? <p className="muted">No DNS record found</p> : null}
        {dossier.lookups.map((lookup) => (
          <article key={`${lookup.direction}-${lookup.query}`} className="record">
            <div className="section-head">
              <span className="kicker">{lookup.direction}</span>
              {lookup.agreesWithCpnr ? null : <span className="warning">Disagrees with CPNR</span>}
            </div>
            <p className="mono">{lookup.query}</p>
            <p className="muted">{lookup.answer}</p>
          </article>
        ))}
        <p className="hint">Resolver: {live.dns ? live.dns.detail : "Asking the system resolver."}</p>
      </section>

      <section className="panel tool">
        <div className="tools-head">
          <h3>CPNR</h3>
          <span className="kicker">DNS records</span>
        </div>
        {dossier.dns.length === 0 ? <p className="muted">No CPNR record found</p> : null}
        {dossier.dns.map((entry) => (
          <article key={`${entry.record.type}-${entry.record.name}`} className="record">
            <div className="section-head">
              <span className="mono">{entry.record.type}</span>
              {entry.conflict ? <span className="warning">Disagrees</span> : null}
            </div>
            <p>{entry.record.name}</p>
            <p className="muted">{entry.record.value}</p>
            <p className="hint">{entry.record.zone}</p>
          </article>
        ))}
        {live.cpnr?.warning ? <p className="warn-copy">{live.cpnr.warning}</p> : null}
      </section>

      <section className="panel tool">
        <div className="tools-head">
          <h3>NNMi</h3>
          <span className="kicker">nnmi/alarms</span>
        </div>
        {dossier.alarms.length === 0 ? <p className="muted">No open alarm is tied to this investigation.</p> : null}
        {dossier.alarms.map((alarm) => (
          <article key={alarm.id} className="record">
            <p>
              <span className={alarm.severity === "major" || alarm.severity === "critical" ? "major" : "warning"}>{alarm.severity}</span>
              <span className="muted"> · {alarm.state}</span>
            </p>
            <p>{alarm.summary}</p>
            <p className="hint">
              {alarm.node}
              {alarm.interface ? ` ${alarm.interface}` : ""} · {formatRegina(alarm.time)}
            </p>
          </article>
        ))}
        {live.nnmi?.warning ? <p className="warn-copy">{live.nnmi.warning}</p> : null}
      </section>

      <section className="panel tool">
        <div className="tools-head">
          <h3>Network Automation</h3>
          <span className="kicker">Configuration changes and allowlisted commands</span>
        </div>
        {dossier.changes.length === 0 ? <p className="muted">No related configuration change in the snapshot.</p> : null}
        {dossier.changes.map(({ hostname, change }) => (
          <article key={change.id} className="record">
            <p>{change.summary}</p>
            <p className="hint">
              {hostname} · {change.user} · {formatRegina(change.time)}
            </p>
            <pre>
              {change.diff.split("\n").map((line, index) => (
                <div key={`${change.id}-${index}`} className={line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : ""}>
                  {line}
                </div>
              ))}
            </pre>
          </article>
        ))}
        <div className="record">
          <p className="hint">
            Allowlisted show commands. The runner rejects anything outside this list, and it does not return a second copy of the running configuration.
          </p>
          <label htmlFor="na-command">Command</label>
          <select id="na-command" value={command} onChange={(event) => setCommand(event.target.value)}>
            {commands.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <p className="hint">Device {device || "is not resolved yet"}</p>
          <div className="actions">
            <button type="button" className="btn small" onClick={() => void runCommand()} disabled={running || !device}>
              Run
            </button>
            <button type="button" className="btn-ghost small" onClick={() => setNa(null)}>
              Clear
            </button>
          </div>
          {na?.warning ? <p className="warn-copy">{na.warning}</p> : null}
          {na?.error ? <p className="warn-copy">{na.error}</p> : null}
          {na?.sent && na.stdout ? <pre>{na.stdout}</pre> : null}
        </div>
      </section>
      <p className="hint">
        configs_swan and show_swan_facts here are a Region 10 slice of the nightly index. A DNS lookup is the system resolver. CPNR is the zone. NetBox, CPNR, NNMi, and Network Automation stay unwired until their environment variables are set, and SWAN does not send a command when the runner is missing.
      </p>
    </aside>
  );
}

function FragmentRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function LiveNote({ pending, warning, empty }) {
  if (pending) return <p className="hint">Checking the live connector.</p>;
  if (warning) return <p className="warn-copy">{warning}</p>;
  if (empty) return <p className="hint">{empty}</p>;
  return null;
}
