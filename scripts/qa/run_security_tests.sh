#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment.
NODE_NO_WARNINGS=1 node docs/testting/security_test_suite.mjs
