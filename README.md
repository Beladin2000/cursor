# SWAN

SWAN is an investigation workspace for the SWAN network. Search once for a device, IP address, MAC address, or VLAN. SWAN walks the nightly index first, then the live systems that add something the index cannot.

The nightly index is built from two GitLab repositories:

- `configs_swan` at `gitlab.stholdco.com/gestalt/configs_swan.git` — running configuration, device identity, interfaces, VLANs, SVIs, routes, ACLs, F5, and configuration references. The latest build is 1,270 devices, 1,300,053 configuration records, and 131 search chunks.
- `show_swan_facts` at `gitlab.stholdco.com/swan/show_swan_facts.git` — operational output. ARP comes from `show_ip_arp_all/Show_IP_ARP_All-YYYYMMDD.csv` (16,643 records). MAC tables come from `show_mac_address_table_all/Show_MAC_ADDRESS_TABLE_All-YYYYMMDD.csv` (307,680 records).

SWAN joins those into the correlation index under `AIconfig-search/public/data/` (`manifest.json`, the ARP, MAC, correlation, operational, and evidence indexes, and `chunk-0000` through `chunk-0130`). The latest build holds 10,534 IP correlations, 16,887 MAC correlations, 962 device correlations, 1,129 operational devices, 5,644 routes, 47,209 policies, 14,339 evidence IPs, 1,269 evidence devices, and 1,319 evidence VLANs.

## V20.3.5

The React app is V20.3.5. Indexed configuration, ARP, and MAC are built first. Live NetBox, NNMi, and OpenText NA go through the V27 FastAPI entry in `AIconfig-search/api_server.py`, which calls `ai_server.py`. There is one stylesheet, `react/src/styles.css`. Allowlisted Network Automation commands live in `react/src/liveCommands.json`.

```bash
python3 AIconfig-search/build_index.py \
  --config-root AIconfig-search/data/region10/configs \
  --project-root AIconfig-search \
  --chunk-size 10000
python3 AIconfig-search/scripts/build_arp_index.py \
  --facts-root AIconfig-search/data/region10/show_swan_facts \
  --output AIconfig-search/public/data
python3 AIconfig-search/scripts/build_mac_index.py \
  --facts-root AIconfig-search/data/region10/show_swan_facts \
  --output AIconfig-search/public/data
python3 AIconfig-search/scripts/build_correlation_index.py --data-root AIconfig-search/public/data
python3 AIconfig-search/scripts/build_operational_index.py --data-root AIconfig-search/public/data
python3 AIconfig-search/scripts/build_evidence_index.py --data-root AIconfig-search/public/data
```

`data/region10` is the linked sample. Production CI points `--config-root` at a `configs_swan` checkout and `--facts-root` at `show_swan_facts`. Node 20 builds the React app. Python 3.11 builds the indexes. Apache serves `public/` and proxies `/api` to the FastAPI process. See `docs/architecture.md` and `deploy/apache-swan.conf`.

The downloadable script set is `AIconfig-search/scripts/`. `scripts/README.txt` lists every command. One shot:

```bash
sh AIconfig-search/scripts/build_all.sh
```

That writes the indexes under `AIconfig-search/public/data/`. `public/data/` is gitignored, so a fresh clone still builds them locally.

No credentials are stored in the tree. Set these only when the live system is actually attached:

- `NETBOX_URL`, `NETBOX_TOKEN`
- `CPNR_URL`, `CPNR_TOKEN`
- `NNMI_URL`
- `NA_COMMAND_RUNNER` — an executable that receives the device and one allowlisted command as two arguments. `show running-config` is rejected.

When a variable is unset, the UI shows a backend configuration warning and does not call that system. An empty resolver answer is “No DNS record found”. An empty CPNR answer is “No CPNR record found”. The Copilot handoff is the evidence packet, not a conclusion.

This workspace answers investigations from `AIconfig-search/builtin_slice.json`, a linked Region 10 slice, until `public/data` is built from the two GitLab repositories. Production counts stay on the home page and are not the slice counts.

### Run V20.3.5

```bash
pip install -r AIconfig-search/requirements.txt
python3 AIconfig-search/api_server.py
```

That starts the V27 FastAPI app on `0.0.0.0:4183`. In another shell:

```bash
cd AIconfig-search/react
npm install
npm run dev
```

Open [http://127.0.0.1:4179](http://127.0.0.1:4179). Vite proxies `/api` to the Python server.

```bash
python3 AIconfig-search/api_server.py --self-test
```

## What an investigation returns

- Identity: vendor, platform, management address, site
- Interfaces, VLANs, ARP, MAC entries, and routes that actually involve the query
- Indexed configuration, with the matching lines highlighted
- Related evidence on other devices
- NetBox IP, prefix, VRF, and prefix hierarchy from the slice, plus a live NetBox call when `NETBOX_URL` is set
- A DNS lookup through the system resolver, and the CPNR records from the index
- NNMi related alarms from the index, and a live alarm call when `NNMI_URL` is set
- Network Automation change history, plus allowlisted show commands
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
