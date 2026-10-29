import { investigate } from "@/lib/investigate";
import { summarize } from "@/lib/summarize";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const forceConfig = new URL(request.url).searchParams.get("as") === "config";
  const result = investigate(query, forceConfig);
  if (result.kind !== "dossier") {
    return NextResponse.json(result);
  }
  const summary = summarize(result.dossier);
  return NextResponse.json({
    kind: "dossier",
    query: result.dossier.query,
    queryType: result.dossier.queryType,
    title: result.dossier.title,
    subtitle: result.dossier.subtitle,
    chain: result.dossier.chain,
    anomalies: result.dossier.anomalies.map((anomaly) => ({
      severity: anomaly.severity,
      title: anomaly.title,
      detail: anomaly.detail,
    })),
    sources: result.dossier.sources,
    counts: {
      devices: result.dossier.devices.length,
      interfaces: result.dossier.interfaces.length,
      arp: result.dossier.arp.length,
      macs: result.dossier.macs.length,
      routes: result.dossier.routes.length,
      alarms: result.dossier.alarms.length,
      changes: result.dossier.changes.length,
    },
    summary: {
      headline: summary.headline,
      paragraphs: summary.paragraphs,
      leading: summary.leading,
      healthy: summary.healthy,
      checks: summary.checks,
    },
  });
}
