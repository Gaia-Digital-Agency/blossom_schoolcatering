#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment.
node docs/testting/admin_crud_test.mjs
