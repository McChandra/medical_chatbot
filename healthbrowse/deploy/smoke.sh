#!/usr/bin/env bash
# Probe a running standalone service. Nonzero status blocks the release.
set -euo pipefail
base="${1:?provide the service URL}"
for route in /healthz /readyz / /api/config; do
  curl --silent --show-error --fail --output /dev/null --retry 10 --retry-all-errors \
    --retry-delay 1 --max-time 10 "${base%/}${route}"
done
