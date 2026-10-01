# jasmin-port

A browser version of **Jasmin**, the x86 assembler simulator from the Technische
Universität München, rewritten in TypeScript and Angular. It aims to look and behave
like the original Java desktop application, and runs entirely client-side: no
server, no install, just a static web page.

## The original

Jasmin (Java Assembler Interpreter) was developed by second-term students for the
[Chair of Computer Architecture (LRR)](http://www.lrr.in.tum.de) at TUM as a
learning tool for x86 assembler. It lets students write assembly code, step through
it line by line, and watch registers, flags, memory, the stack and simple I/O devices
change.

- Source: <https://github.com/TUM-LRR/Jasmin> (last release 1.5.11, 2016)
- Older releases: <https://sourceforge.net/projects/tum-jasmin/>

Initial development by Yang Guo, Jakob Kummerow, Kai Orend and Stefanie Schmid, with
documentation and tutorials by André Aichert, and later contributions from the TUM-LRR
community.

## Status

The project scaffold is in place (milestone M0 of [docs/plan.md](docs/plan.md)); the
interpreter and UI are being built next. [spec/README.md](spec/README.md) describes the
original's UI and behavior in detail, lists where the port deliberately fixes bugs
in the original ([spec/07-known-quirks.md](spec/07-known-quirks.md)), and includes
conformance programs whose expected output comes from the original interpreter
([spec/08-conformance.md](spec/08-conformance.md)).

## Development

Requires Node.js 22.22.3+ or 24.15+ (see `.nvmrc`).

```
npm ci
npm start                 # dev server at http://localhost:4200
npm test                  # core unit tests (Node) and component tests
npm run lint
npm run conformance       # spec/conformance programs against the headless runner
npm run e2e               # Playwright; set PW_CHROMIUM_PATH to use a preinstalled Chromium
```

`src/app/core/` is the interpreter and must not depend on Angular, the DOM or Node
(enforced by ESLint); `src/headless/run.ts` runs it under Node for the conformance tests.

## License

GNU General Public License, version 2, the same license as the original. See
[LICENSE.md](LICENSE.md). The port reuses the original's help pages and images.
