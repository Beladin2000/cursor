"use client";

import { useMemo, useState } from "react";
import { vlanMatrix } from "@/lib/investigate";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function VlanMatrix({ onOpen }: { onOpen: (query: string) => void }) {
  const rows = useMemo(() => vlanMatrix(), []);
  const [filter, setFilter] = useState("");
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const needle = filter.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (anomaliesOnly && row.anomalyCount === 0) return false;
    if (!needle) return true;
    const haystack = `${row.vlanId} ${row.names.join(" ")} ${row.sites.join(" ")} ${row.devices.join(" ")}`.toLowerCase();
    return haystack.includes(needle);
  });

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Master VLAN matrix</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One row per VLAN ID across the loaded slice, instead of opening each device. A reused ID keeps every name it was given.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by VLAN, name, or site"
            aria-label="Filter the VLAN matrix"
            className="sm:w-64"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={anomaliesOnly}
              onChange={(event) => setAnomaliesOnly(event.target.checked)}
              className="size-4 accent-[var(--signal)]"
            />
            Findings only
          </label>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No VLANs match this filter.</p>
      ) : (
        <div className="mt-4 rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>VLAN</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Sites</TableHead>
                <TableHead className="text-right">Devices</TableHead>
                <TableHead className="text-right">Access</TableHead>
                <TableHead className="text-right">Trunks</TableHead>
                <TableHead className="text-right">Native</TableHead>
                <TableHead className="text-right">SVIs</TableHead>
                <TableHead>Findings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow
                  key={row.vlanId}
                  className={row.anomalyCount > 0 ? "bg-warn/5" : undefined}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="font-mono text-signal hover:underline"
                      onClick={() => onOpen(`vlan ${row.vlanId}`)}
                    >
                      {row.vlanId}
                    </button>
                  </TableCell>
                  <TableCell>{row.names.join(" / ")}</TableCell>
                  <TableCell className="max-w-48 text-muted-foreground">{row.sites.join(", ")}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.devices.length}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.accessCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.trunkCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.nativeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.sviCount}
                    {row.sviDown > 0 ? <span className="text-warn"> · {row.sviDown} down</span> : null}
                  </TableCell>
                  <TableCell className={row.anomalyCount > 0 ? "text-warn" : "text-muted-foreground"}>
                    {row.anomalyCount === 0 ? "None" : row.anomalyTitles.join("; ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
