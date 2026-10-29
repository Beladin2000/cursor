# SWAN V20.3.5

The React frontend is V20.3.5. Indexed data is built before anyone searches. Live data leaves through the V27 FastAPI entry.

```
User
  → React V20.3.5
       ├─ indexed: configs_swan, ARP, MAC
       │     → correlation / operational / evidence
       │     → device, IP, MAC
       │     → interface, VLAN, route
       │     → related configuration evidence
       │     → investigation
       │     → Copilot-ready findings
       └─ live: V27 FastAPI (api_server.py)
             → ai_server.py
             → NetBox, NNMi, OpenText NA
```

GitLab CI uses two build images, then Apache serves the result:

- Node 20 builds `react/` into `public/`.
- Python 3.11 runs `build_index.py`, then the ARP, MAC, correlation, operational, and evidence builders.
- Apache serves `public/` and proxies `/api` to Uvicorn.

The Region 10 files under `data/region10/` are the linked sample used when the GitLab configuration and facts repositories are not on this machine. Production still clones `configs_swan` and `show_swan_facts`.
