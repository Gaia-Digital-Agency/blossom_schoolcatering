#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment with seeded role users.
NODE_NO_WARNINGS=1 node docs/testting/consolidated_runner.mjs
NODE_NO_WARNINGS=1 node docs/testting/extra_kitchen_billing_test.mjs
