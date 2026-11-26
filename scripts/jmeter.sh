#!/usr/bin/env bash
# Called by run.sh once the app is listening on $PORT.
set -euo pipefail
OUT=.perf/out
jmeter -n \
  -t "$OUT/plan.jmx" \
  -l "$OUT/results.jtl" \
  -j "$OUT/jmeter.log" \
  -e -o "$OUT/jmeter-report" \
  -Jhost=localhost -Jport="$PORT"
