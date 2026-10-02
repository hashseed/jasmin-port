#!/usr/bin/env bash
# Bubblesort benchmark: runs bench/bubblesort.mjs programs on the original Java
# interpreter and on the TypeScript port, checks both results, and prints the times.
# Usage: bash bench/run-bench.sh [N ...]     (default: 100 1000 10000)
# Needs Node 24, npm dependencies and a JDK (see spec/reference-harness/README.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HARNESS="$ROOT/spec/reference-harness"
WORK="${WORK:-$HARNESS/.work}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
if [ -n "${JAVA_HOME:-}" ]; then PATH="$JAVA_HOME/bin:$PATH"; fi

# The TypeScript runner.
(cd "$ROOT" && npx esbuild src/headless/bench.ts --bundle --platform=node --target=node22 \
  --log-level=warning --outfile=dist/headless/bench.js)

# The original: let the reference harness clone and build it, then add Bench.java.
bash "$HARNESS/run-original.sh" --check
if [ ! -d "$WORK/build" ]; then
  echo 'nop' > "$OUT/nop.asm"
  bash "$HARNESS/run-original.sh" "$OUT/nop.asm" > /dev/null
fi
mkdir -p "$WORK/bench-build"
javac -nowarn -Xlint:none -d "$WORK/bench-build" -cp "$WORK/build" "$ROOT/bench/Bench.java" 2> /dev/null
JAVA_CP="$WORK/build:$WORK/bench-build"

field() { grep -o "$1=0x[0-9A-F]*" | head -1; }
[ $# -eq 0 ] && set -- 100 1000 10000
printf '%8s %14s %10s %10s %8s  %s\n' entries instructions java_ms ts_ms ts/java result
status=0
for n in "$@"; do
  asm="$OUT/bubblesort-$n.asm"
  node "$ROOT/bench/bubblesort.mjs" asm "$n" > "$asm"
  memory=$(( (n * 4 + 4095) / 4096 * 4096 + 4096 ))
  # The original's CommandLoader prints its progress on stdout; drop it as run-original.sh does.
  java -Djava.awt.headless=true -cp "$JAVA_CP" jasmin.harness.Bench "$asm" "$memory" \
    2> "$OUT/java.err" | grep -v 'loading\|looks like\|searching\|command(s)\|done with\|^$' \
    > "$OUT/java.out"
  node "$ROOT/dist/headless/bench.js" "$asm" "$memory" > "$OUT/ts.out" 2> "$OUT/ts.err"
  java_ms=$(grep -o 'ms=[0-9]*' "$OUT/java.err" | cut -d= -f2)
  steps=$(grep -o 'steps=[0-9]*' "$OUT/java.err" | cut -d= -f2)
  ts_ms=$(grep -o 'ms=[0-9]*' "$OUT/ts.err" | cut -d= -f2)
  expected="$(node "$ROOT/bench/bubblesort.mjs" expect "$n")"
  result=ok
  for impl in java ts; do
    got="$(field EAX < "$OUT/$impl.out") $(field EBX < "$OUT/$impl.out") $(field EDI < "$OUT/$impl.out")"
    if [ "$got" != "$expected" ]; then result="WRONG ($impl: $got, expected $expected)"; status=1; fi
  done
  # AF may differ: the port computes it as x86 does (spec 07, Q-F-1), the original did not.
  if ! cmp -s <(sed 's/ AF=[01]//' "$OUT/java.out") <(sed 's/ AF=[01]//' "$OUT/ts.out"); then
    result="$result; final states differ"; status=1
  fi
  ratio=$(awk -v t="$ts_ms" -v j="$java_ms" 'BEGIN { printf "%.2f", (j > 0 ? t / j : 0) }')
  printf '%8s %14s %10s %10s %8s  %s\n' "$n" "$steps" "$java_ms" "$ts_ms" "$ratio" "$result"
done
exit $status
