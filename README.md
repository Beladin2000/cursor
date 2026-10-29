# SWAN

SWAN is an investigation workspace for the SWAN network. Search once for a device, IP address, MAC address, or VLAN. SWAN correlates the indexed configuration with ARP, MAC tables, routes, VLANs, and the operational records that would otherwise be checked one system at a time.

Version **V20.3.2** in this workspace loads a fully linked Region 10 slice (plus the Region 07 aggregate that covers it). The production pipeline counts — about 1,270 devices, 1.3 million configuration records, 16,643 ARP entries, and 307,680 MAC entries — are shown beside the slice so the scale of the index is visible. Those production systems are not attached here.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4179](http://127.0.0.1:4179).

```bash
npm test
```

The tests exercise the correlation engine: device, IP, MAC, VLAN, prefix, and configuration search.

## What an investigation returns

- Identity: vendor, platform, management address, site
- Interfaces, VLANs, ARP, MAC entries, and routes that actually involve the query
- Indexed configuration, with the matching lines highlighted
- Related evidence on other devices
- NetBox, DNS / CPNR, NNMi alarms, and Network Automation change history from the slice snapshot
- **Summarize Findings**, which reads that evidence and writes the packet a Copilot handoff would receive

Network Automation is used for change history. SWAN already has the indexed configuration, so there is no second “view live configuration” dump.

## Paths worth opening

| Query | What it shows |
| --- | --- |
| `C9300-REGN10-4C-MGT-1` | Building 4C management switch, and where else `10.40.8.14` is configured |
| `10.40.24.46` | Badge reader: ARP, MAC, access port, VLAN 240, NetBox, CPNR, firewall policy |
| `02:4c:10:00:02:19` | One MAC on two access ports, with forward and reverse DNS that disagree |
| `vlan 240` | Badge VLAN across the building, including a native VLAN mismatch |
| `10.40.40.15` | Reserved printer address: policy and NetBox, no ARP |
| `ntp server` | Configuration search across the slice |

The VLAN matrix lists every VLAN ID across devices instead of opening them one at a time.

`GET /api/investigate?q=10.40.24.46` returns the same correlation as JSON.
