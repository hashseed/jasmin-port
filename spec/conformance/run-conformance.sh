#!/usr/bin/env bash
# Runs the conformance programs headlessly against one implementation and compares
# the final machine state with the expected output.
#
# Usage: bash run-conformance.sh java|ts [program.asm ...]
#   java  the original Java interpreter (../reference-harness/run-original.sh);
#         compared with NN.expected
#   ts    the TypeScript port; the command in $JASMIN_TS_RUNNER is run as
#         "$JASMIN_TS_RUNNER file.asm" and must print the same format (08 §2);
#         compared with NN.port.expected when it exists, else NN.expected
# Without program arguments, all programs/*.asm are run.
# Trailing whitespace on each line is ignored. Exit status 1 if any program differs.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IMPL="${1:-}"; shift || true
case "$IMPL" in
  java) RUNNER=(bash "$HERE/../reference-harness/run-original.sh") ;;
  ts)
    if [ -z "${JASMIN_TS_RUNNER:-}" ]; then
      echo "Set JASMIN_TS_RUNNER to the port's headless runner, e.g. 'node dist/headless/run.js'" >&2
      exit 2
    fi
    read -r -a RUNNER <<< "$JASMIN_TS_RUNNER" ;;
  *) echo "usage: bash run-conformance.sh java|ts [program.asm ...]" >&2; exit 2 ;;
esac
if [ $# -eq 0 ]; then set -- "$HERE"/programs/*.asm; fi

normalize() { sed -e 's/[[:space:]]*$//'; }
pass=0; fail=0
for asm in "$@"; do
  base="${asm%.asm}"
  expected="$base.expected"
  if [ "$IMPL" = ts ] && [ -f "$base.port.expected" ]; then expected="$base.port.expected"; fi
  actual="$("${RUNNER[@]}" "$asm" 2>/dev/null | normalize)"
  if [ "$actual" = "$(normalize < "$expected")" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $(basename "$asm") (expected: $(basename "$expected"))"
    diff <(normalize < "$expected") <(printf '%s\n' "$actual") | sed 's/^/    /'
  fi
done
echo "$IMPL: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
