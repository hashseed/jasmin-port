#!/usr/bin/env bash
# Runs the ORIGINAL Jasmin interpreter headlessly on .asm files and prints the
# final machine state in the format of ../conformance/programs/*.expected.
# Usage: bash run-original.sh prog.asm [more.asm ...]
# Needs: git, a JDK (tested with OpenJDK 21).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$HERE/.work}"
# Use $JAVA_HOME if set, otherwise java/javac from PATH.
if [ -n "${JAVA_HOME:-}" ]; then PATH="$JAVA_HOME/bin:$PATH"; fi
if ! command -v java >/dev/null || ! command -v javac >/dev/null; then
  echo "run-original.sh: no JDK found (need java and javac on PATH, or JAVA_HOME set)." >&2
  echo "See spec/reference-harness/README.md, section Requirements." >&2
  exit 3
fi
if [ "${1:-}" = "--check" ]; then exit 0; fi
if [ ! -d "$WORK/src" ]; then
  rm -rf "$WORK"; mkdir -p "$WORK"
  git clone -q https://github.com/TUM-LRR/Jasmin.git "$WORK/Jasmin"
  git -C "$WORK/Jasmin" checkout -q 9bb04d15032cebbb4379c717f39c9030f630800b
  cp -r "$WORK/Jasmin/src" "$WORK/src"
  # Decouple the parser from the Swing document: labels are resolved through an interface.
  cp "$HERE/LabelSource.java" "$WORK/src/jasmin/core/"
  sed -i 's/public JasDocument doc;/public LabelSource doc;/; s/CommandLoader cl, JasDocument jasDoc)/CommandLoader cl, LabelSource jasDoc)/; s/^import jasmin.gui.JasDocument;//' "$WORK/src/jasmin/core/Parser.java"
  mkdir -p "$WORK/src/jasmin/harness"
  cp "$HERE/Run.java" "$WORK/src/jasmin/harness/"
fi
if [ ! -d "$WORK/build" ]; then
  # Compiles whatever is in $WORK/src, so local edits there are picked up after deleting build/.
  mkdir -p "$WORK/build"
  javac -nowarn -Xlint:none -d "$WORK/build" -sourcepath "$WORK/src" "$WORK"/src/jasmin/harness/Run.java "$WORK"/src/jasmin/commands/*.java
fi
for f in "$@"; do
  java -Djava.awt.headless=true -cp "$WORK/build" jasmin.harness.Run "$f" 2>&1 \
    | grep -v 'JAVA_TOOL\|loading\|looks like\|searching\|command(s)\|done with\|^$' || true
done
