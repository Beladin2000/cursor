#!/bin/sh
# Build every local index from the Region 10 sample, or from CONFIG_ROOT and FACTS_ROOT.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SOURCE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PROJECT_ROOT=${PROJECT_ROOT:-$SOURCE_ROOT}
CONFIG_ROOT=${CONFIG_ROOT:-$SOURCE_ROOT/data/region10/configs}
FACTS_ROOT=${FACTS_ROOT:-$SOURCE_ROOT/data/region10/show_swan_facts}
DATA=$PROJECT_ROOT/public/data
PY=${PYTHON:-python3}

"$PY" "$SOURCE_ROOT/build_index.py" --config-root "$CONFIG_ROOT" --project-root "$PROJECT_ROOT" --chunk-size 10000
"$PY" "$SOURCE_ROOT/scripts/build_facts_indexes.py" --facts-root "$FACTS_ROOT" --output "$DATA"
"$PY" "$SOURCE_ROOT/scripts/build_correlation_index.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/build_advanced_correlation.py" \
  --arp "$DATA/arp-index.json" \
  --mac "$DATA/mac-index.json" \
  --devices "$DATA/device-summaries.json" \
  --output "$DATA/advanced-correlation-index.json"
"$PY" "$SOURCE_ROOT/scripts/build_operational_index.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/build_evidence_index.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/enrich_operational_index.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/enrich_evidence_context.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/build_findings_index.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/parser_configs.py" --config-root "$CONFIG_ROOT" --output "$DATA/parsed-devices.json"
"$PY" "$SOURCE_ROOT/scripts/build_cpnr_index.py" --config-root "$CONFIG_ROOT" --output "$DATA/cpnr-index.json"
"$PY" "$SOURCE_ROOT/scripts/build_recent_changes.py" --output "$DATA/recent-changes.json"
"$PY" "$SOURCE_ROOT/scripts/build_netbox_context.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/generate_json.py" --data-root "$DATA" --output "$DATA/swan-summary.json"
"$PY" "$SOURCE_ROOT/scripts/set_v20d_manifest.py" --data-root "$DATA"
"$PY" "$SOURCE_ROOT/scripts/export_copilot_txt.py" "$DATA/findings-index.json" -o "$DATA/copilot-evidence.txt"
"$PY" "$SOURCE_ROOT/scripts/publish_swan_ai_assets.py" --project-root "$PROJECT_ROOT"
echo "indexes written to $DATA"
