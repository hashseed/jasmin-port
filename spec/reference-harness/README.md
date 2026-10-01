# Reference harness: running the original Jasmin headlessly

This folder runs the **original** Java interpreter (TUM-LRR/Jasmin 1.5.11, commit
`9bb04d1`) on `.asm` files without its Swing UI, and prints the final machine state.
Use it to answer any "what did the original do?" question, and to regenerate the
expected outputs in `../conformance/programs/`.

Only the interpreter runs here (parser, instructions, registers, memory, FPU). The UI
and the I/O devices are not exercised.

## Requirements

- `git` and network access to github.com (the script clones the original on first use)
- A JDK (tested with OpenJDK 21). On Debian or Ubuntu,
  install `openjdk-21-jdk-headless`.
- `bash` and GNU `sed`. On macOS, install `gnu-sed` and put it first on `PATH`, because
  BSD `sed -i` takes different arguments.

## Usage

```
bash spec/reference-harness/run-original.sh prog.asm [more.asm ...]
```

Invoke the script with `bash` (it is not marked executable).

The first run clones the original into `spec/reference-harness/.work/`, patches it and
compiles it, which takes a few seconds. Later runs reuse that build. Set `WORK=/some/dir`
to build somewhere else. Delete `.work/` to start over from a fresh clone.

Example:

```
$ cat loop.asm
mov ecx, 3
l: dec ecx
jnz l
$ bash spec/reference-harness/run-original.sh loop.asm
EAX=0x00000000 EBX=0x00000000 ECX=0x00000000 EDX=0x00000000 ESI=0x00000000 EDI=0x00000000 ESP=0x00001000 EBP=0x00001000 EIP=0x00000004
CF=0 OF=0 SF=0 ZF=1 PF=1 AF=1 DF=0
MEM (non-zero bytes):
FPU: ST0=0.0 ST1=0.0 ST2=0.0 ST3=0.0 ST4=0.0 ST5=0.0 ST6=0.0 ST7=0.0
```

(`EIP` is 4 because the file's final newline makes an empty line 3, which also
executes. `AF=1` is the original's AF bug, 07 Q-F-1. The port gives `AF=0`.)

## What the script does

1. Clones `https://github.com/TUM-LRR/Jasmin` and checks out the pinned commit.
2. Copies `LabelSource.java` into the original source and uses `sed` to make
   `jasmin.core.Parser` depend on that interface instead of the Swing class
   `jasmin.gui.JasDocument`. The parser only needs the document to look up which line a
   label is on. This is the only change to the original code.
3. Adds `Run.java` (package `jasmin.harness`), the driver, and compiles it with the core
   and all instruction classes (`jasmin/commands/*.java`) using `javac`.
4. Runs `java -Djava.awt.headless=true jasmin.harness.Run file.asm` for each argument and
   filters out the original's start-up log lines.

## What the driver does

`Run.java` reproduces **Run from a fresh document** with default settings (4096 bytes of
memory at offset 0, no breakpoints):

1. Parses every line twice, so forward label references resolve. A line's error is
   printed as `PARSE line N: <message> @<start>+<length>`, and a parser crash as
   `PARSE-EXCEPTION line N: <exception>`.
2. Executes like pressing Step repeatedly (`ln := EIP; EIP := ln + 1; execute line ln`)
   until EIP passes the last line, an error occurs, or 100000 steps have run (so an
   endless loop still terminates). A runtime error prints `ERROR line N: <message>`, a
   Java exception `EXCEPTION line N: <class>: <message>`. Both stop the run.
3. Prints the registers, flags, non-zero memory bytes and the FPU registers. 08 §2
   describes the format.

Line numbers are 0-based, like the gutter in Jasmin.

## Regenerating the conformance expectations

```
cd spec/conformance/programs
for f in *.asm; do bash ../../reference-harness/run-original.sh "$f" > "${f%.asm}.expected"; done
```

This reproduces all 44 `.expected` files byte for byte. They are the **original's**
output. Where the port intentionally differs, `NN.port.expected` holds the port's
expectation and 08 §3 explains the changes; those files are maintained by hand.

To check everything at once, use `bash spec/conformance/run-conformance.sh java`
(08 §4).

## Trying a fix in the original

To measure the effect of a proposed fix (as was done for Q-F-1 and Q-I-13), edit the
Java files under `.work/src/`, delete `.work/build`, and rerun. The script then
recompiles the edited sources without cloning again. Then diff the results against the
`.expected` files.

## In the devenv container

The devenv image has no JDK. Either add `openjdk-21-jdk-headless` to the Dockerfile
as its own `RUN apt-get ...` layer after the n8n install (so the cached n8n layer is
reused), or use a portable JDK without root:

```
curl -sSL -o jdk.tgz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
tar xzf jdk.tgz && rm jdk.tgz
export PATH="$PWD/$(ls -d jdk-21*/ | head -1)bin:$PATH"
```

Claude Code's sandbox proxy times out on github.com, so the first run (the clone)
has to run outside the sandbox. Later runs need no network.
