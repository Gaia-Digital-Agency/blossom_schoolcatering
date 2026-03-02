#!/usr/bin/env bash
set -euo pipefail

# Requires running API + DB environment.
node docs/testting/security_test_suite.mjs
