#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment.
NODE_NO_WARNINGS=1 node docs/testting/admin_crud_test.mjs
