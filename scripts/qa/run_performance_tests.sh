#!/usr/bin/env bash
set -euo pipefail

# Requires running API endpoint. Override with PERF_* env vars if needed.
node docs/testting/perf_peak_load_test.mjs
