# SWAN

SWAN is an investigation workspace for the SWAN network. Search once for a device, IP address, MAC address, or VLAN. SWAN walks the nightly index first, then the live systems that add something the index cannot.

The nightly index is built from two GitLab repositories:

- `configs_swan` at `gitlab.stholdco.com/gestalt/configs_swan.git` — running configuration, device identity, interfaces, VLANs, SVIs, routes, ACLs, F5, and configuration references. The latest build is 1,270 devices, 1,300,053 configuration records, and 131 search chunks.
- `show_swan_facts` at `gitlab.stholdco.com/swan/show_swan_facts.git` — operational output. ARP comes from `show_ip_arp_all/Show_IP_ARP_All-YYYYMMDD.csv` (16,643 records). MAC tables come from `show_mac_address_table_all/Show_MAC_ADDRESS_TABLE_All-YYYYMMDD.csv` (307,680 records).

SWAN joins those into the correlation index under `AIconfig-search/public/data/` (`manifest.json`, the ARP, MAC, correlation, operational, and evidence indexes, and `chunk-0000` through `chunk-0130`). The latest build holds 10,534 IP correlations, 16,887 MAC correlations, 962 device correlations, 1,129 operational devices, 5,644 routes, 47,209 policies, 14,339 evidence IPs, 1,269 evidence devices, and 1,319 evidence VLANs.

Live connectors follow the V20.5.2 mapping and stay separate from that index. NetBox returns the address, most-specific prefix, VRF, status, role, DNS name, assigned device and interface, site, VLAN, tenant, and prefix hierarchy. DNS and CPNR are separate calls: an empty answer is “No DNS record found” or “No CPNR record found”. NNMi stays on `nnmi/alarms`. Network Automation keeps the change diff and an allowlisted set of show commands; a missing command path is a backend configuration warning, and the runner rejects anything outside the list. The Copilot handoff is the evidence packet, not a conclusion.

Version **V20.3.2** in this workspace loads a fully linked Region 10 slice, plus the Region 07 aggregate that covers it. The production counts are shown on the home page. The live connectors in this workspace are filled from the slice so an investigation can be walked without those systems attached.

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
- NetBox IP, prefix, and VRF context
- A DNS lookup, and the CPNR records behind it
- NNMi related alarms
- Network Automation change history: what changed, when, and on which device
- **Summarize Findings**, which reads that evidence and writes the packet a Copilot handoff would receive

Network Automation is the change record. The running configuration already comes from `configs_swan`.

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
