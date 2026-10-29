SWAN scripts
============

These are the index, correlation, evidence, and export scripts for
AIconfig-search. They use the Python 3.11 standard library. No credentials
are stored in the files.

Run the whole sample build from AIconfig-search:

  sh scripts/build_all.sh

That reads data/region10. Point CONFIG_ROOT at a configs_swan checkout and
FACTS_ROOT at show_swan_facts when those repositories are on the machine.

Individual commands:

  python3 build_index.py --config-root data/region10/configs --project-root . --chunk-size 10000
  python3 scripts/build_arp_index.py --facts-root data/region10/show_swan_facts --output public/data
  python3 scripts/build_mac_index.py --facts-root data/region10/show_swan_facts --output public/data
  python3 scripts/build_facts_indexes.py --facts-root data/region10/show_swan_facts --output public/data
  python3 scripts/build_correlation_index.py --data-root public/data
  python3 scripts/build_advanced_correlation.py --arp public/data/arp-index.json --mac public/data/mac-index.json --devices public/data/device-summaries.json --output public/data/advanced-correlation-index.json
  python3 scripts/build_operational_index.py --data-root public/data
  python3 scripts/build_evidence_index.py --data-root public/data
  python3 scripts/enrich_operational_index.py --data-root public/data
  python3 scripts/enrich_evidence_context.py --data-root public/data
  python3 scripts/build_findings_index.py --data-root public/data
  python3 scripts/parser_configs.py --config-root data/region10/configs --output public/data/parsed-devices.json
  python3 scripts/build_cpnr_index.py --config-root data/region10/configs --output public/data/cpnr-index.json
  python3 scripts/build_recent_changes.py --output public/data/recent-changes.json
  python3 scripts/build_netbox_context.py --data-root public/data
  python3 scripts/netbox_ipam_sync.py --data-root public/data
  python3 scripts/generate_json.py --data-root public/data --output public/data/swan-summary.json
  python3 scripts/set_v20d_manifest.py --data-root public/data
  python3 scripts/export_running_configs.py --config-root data/region10/configs --output-dir public/configs
  python3 scripts/export_copilot_txt.py public/data/findings-index.json -o public/data/copilot-evidence.txt
  python3 scripts/publish_swan_ai_assets.py --project-root .
  python3 scripts/render_swan_live_env.py
  sh scripts/deploy-react.sh

NetBox scripts call the live API only when NETBOX_URL is set. render_swan_live_env.py
prints SET or UNSET and never prints a token.

apply_v20_3.py, apply_v20_5_1_locked.py, and apply_v20_5_update.py are not
in this folder. Those files patched an older frontend in place. This tree
already is the V20.3.5 React app.

Live calls are ai_server.py and backend/integrations/network_automation.py.
scripts/live_api is a pointer to those modules, not a second HTTP server.
