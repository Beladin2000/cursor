import { useEffect, useState } from "react";

export function VlanMatrix({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [filter, setFilter] = useState("");
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch("/api/vlan-matrix")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.rows ?? []);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = filter.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (anomaliesOnly && row.anomalyCount === 0) return false;
    if (!needle) return true;
    return `${row.vlanId} ${row.names.join(" ")} ${row.sites.join(" ")} ${row.devices.join(" ")}`.toLowerCase().includes(needle);
  });

  return (
    <section>
      <div className="matrix-head">
        <div>
          <h2>Master VLAN Matrix</h2>
          <p className="muted">One row per VLAN ID across the loaded slice. A reused ID keeps every name it was given.</p>
        </div>
        <div className="matrix-controls">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter the VLAN matrix"
            placeholder="Filter by VLAN, name, or site"
          />
          <label className="check">
            <input type="checkbox" checked={anomaliesOnly} onChange={(event) => setAnomaliesOnly(event.target.checked)} />
            Findings only
          </label>
        </div>
      </div>
      {state === "loading" ? <p className="banner">Loading the VLAN matrix from the index.</p> : null}
      {state === "error" ? <p className="error">The VLAN matrix could not be loaded. The API on port 4183 did not answer.</p> : null}
      {state === "ready" && visible.length === 0 ? <p className="muted">No VLANs match this filter.</p> : null}
      {state === "ready" && visible.length > 0 ? (
        <div className="scroll panel">
          <table>
            <thead>
              <tr>
                <th>VLAN</th>
                <th>Name</th>
                <th>Sites</th>
                <th className="num">Devices</th>
                <th className="num">Access</th>
                <th className="num">Trunks</th>
                <th className="num">Native</th>
                <th className="num">SVIs</th>
                <th>Findings</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.vlanId} className={row.anomalyCount > 0 ? "findings" : undefined}>
                  <td>
                    <button type="button" className="linkish signal" onClick={() => onOpen(`vlan ${row.vlanId}`)}>
                      {row.vlanId}
                    </button>
                  </td>
                  <td>{row.names.join(" / ")}</td>
                  <td className="muted">{row.sites.join(", ")}</td>
                  <td className="num">{row.devices.length}</td>
                  <td className="num">{row.accessCount}</td>
                  <td className="num">{row.trunkCount}</td>
                  <td className="num">{row.nativeCount}</td>
                  <td className="num">
                    {row.sviCount}
                    {row.sviDown > 0 ? <span className="warning"> · {row.sviDown} down</span> : null}
                  </td>
                  <td className={row.anomalyCount > 0 ? "warning" : "muted"}>
                    {row.anomalyCount === 0 ? "None" : row.anomalyTitles.join("; ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
