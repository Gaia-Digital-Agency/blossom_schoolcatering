#!/usr/bin/env bash
set -euo pipefail

NODE_NO_WARNINGS=1 npm --prefix apps/api test -- \
  password-policy.spec.ts \
  core.rules-and-pricing.spec.ts \
  core.service.spec.ts \
  rbac-matrix.spec.ts
