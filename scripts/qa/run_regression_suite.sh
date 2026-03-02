#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment.
node docs/testting/regression_cutoff_weekday_blackout_test.mjs
