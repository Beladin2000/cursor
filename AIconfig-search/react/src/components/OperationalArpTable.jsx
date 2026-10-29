import { useMemo, useState } from "react";

function dedupe(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const entry = row.entry;
    const key = [row.hostname, entry.ip, entry.mac, entry.interface, entry.vrf, entry.protocol].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

export function OperationalArpTable({ rows }) {
  const [filter, setFilter] = useState("");
  const unique = useMemo(() => dedupe(rows), [rows]);
  const needle = filter.trim().toLowerCase();
  const visible = unique.filter((row) => {
    if (!needle) return true;
    const entry = row.entry;
    return [row.hostname, entry.ip, entry.mac, entry.interface, entry.vrf, entry.protocol, entry.age]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const removed = rows.length - unique.length;

  return (
    <div>
      <div className="arp-tools">
        <label>
          Filter ARP
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter ARP entries"
            placeholder="IP, MAC, device, or interface"
          />
        </label>
        <p className="hint">
          {visible.length} {visible.length === 1 ? "entry" : "entries"}
          {removed > 0 ? ` · ${removed} duplicate${removed === 1 ? "" : "s"} hidden` : ""}
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="muted">No ARP entry matches this filter.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>IP</th>
                <th>MAC</th>
                <th>Interface</th>
                <th>VRF</th>
                <th>Age</th>
                <th>Protocol</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={`${row.hostname}-${row.entry.ip}-${row.entry.interface}-${row.entry.mac}`}>
                  <td className="mono">{row.hostname}</td>
                  <td className="mono">{row.entry.ip}</td>
                  <td className="mono">{row.entry.mac}</td>
                  <td className="mono">{row.entry.interface}</td>
                  <td>{row.entry.vrf}</td>
                  <td>{row.entry.age}</td>
                  <td>{row.entry.protocol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
