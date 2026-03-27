#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment.
NODE_NO_WARNINGS=1 node docs/testting/regression_cutoff_weekday_blackout_test.mjs
