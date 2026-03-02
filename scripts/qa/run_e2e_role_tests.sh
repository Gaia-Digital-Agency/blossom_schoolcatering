#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment with seeded role users.
node docs/testting/consolidated_runner.mjs
node docs/testting/extra_kitchen_billing_test.mjs
