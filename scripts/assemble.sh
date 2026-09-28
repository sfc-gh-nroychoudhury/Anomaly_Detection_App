#!/usr/bin/env bash
# Reassembles scripts/setup_script.sql from the sql/ source-of-truth files.
# Run this any time a file under sql/ changes -- never hand-edit setup_script.sql directly.
set -euo pipefail
cd "$(dirname "$0")/.."

{
  echo "-- ============================================================================="
  echo "-- setup_script.sql"
  echo "-- Assembled from sql/01_*.sql through sql/08_*.sql -- DO NOT hand-edit this file."
  echo "-- Edit the source files in sql/ and reassemble instead, so this stays diffable"
  echo "-- and every section traces back to a single source of truth."
  echo "-- ============================================================================="
  echo
  for f in sql/01_infrastructure.sql sql/02_reference_config.sql sql/03_scan_procedure.sql sql/04_cortex_ai_procs.sql sql/05_service.sql sql/06_enterprise_features.sql sql/07_semantic_view.sql sql/08_cortex_agent.sql; do
    echo "-- ---- BEGIN $f ----"
    cat "$f"
    echo "-- ---- END $f ----"
    echo
  done
} > scripts/setup_script.sql

echo "Wrote scripts/setup_script.sql ($(wc -l < scripts/setup_script.sql) lines)"

# Keep the frontend's copy of the external install script in sync -- the
# Setup wizard serves this as a static asset so it can show the exact,
# current script inline without duplicating its content in TS source.
mkdir -p frontend/public
cp external/install_external_ml.sql frontend/public/install_external_ml.sql
echo "Synced frontend/public/install_external_ml.sql"
