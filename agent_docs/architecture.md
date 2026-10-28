# Architecture notes (`src/`, `workers/`, bundling)

> Read before editing `src/`, `workers/` or `index.ts`, or when debugging worklet
> startup, IPC or bundling. Only non-obvious, code-verified facts — the code is the
> reference for everything else. Index: [AGENTS.md](../AGENTS.md).

React Native view (`src/App.tsx`) ↔ `FramedStream` over the BareKit IPC duplex ↔ Bare
worklet (`workers/main.js` → the `hello-pear-worker` package: swarm + corestore +
updater). The code is small — read it for the wiring; below are only the non-obvious
facts.

- **Two packages expose a `PearRuntime`, and they are not interchangeable.**
  `pear-mobile` has an `exports` condition map: React Native resolves to
  `react-native.js` (a **static** `PearRuntime.run(filename, bundle, argv)` that starts a
  Worklet and returns its IPC), while Bare resolves to `bare.js` (the updater/storage
  class). `pear-runtime-react-native` also ships a runtime class, but its `run` is an
  **instance** method (`new PearRuntime().run(...)`). This project uses `pear-mobile`
  for the runtime and imports `pear-runtime-react-native` only for `./plugin` and
  `./metro-config` — never as a runtime import.
- **The `.bundle` extension in `'/worker.bundle'` is load-bearing, and it is Bare that
  requires it, not BareKit.** `Worklet.start()` only type-checks the filename and
  forwards it to the native `startBytes`/`startUTF8`; it never inspects the extension.
  The Bare runtime embedded in BareKit resolves `.bundle` as a Bare bundle rather than
  as plain JavaScript (BareKit's own default worklet name is `bare:/worklet.bundle`).
  The string is an identity, not a path on disk — the bytes come from the imported
  `src/worker.bundle.js`.
- **The IPC duplex emits plain `Uint8Array`, not Buffers** (`BareKitIPC._read` does
  `this.push(new Uint8Array(data))`). `data.toString()` on the React Native side yields
  a comma-joined byte list, not text — decode with `b4a.toString(data)`. In React
  Native, `b4a` resolves through its `"react-native"` export condition to
  `react-native.js`, which falls back to the pure-JS `browser.js` because
  `react-native-b4a` is not installed. `FramedStream` itself needs no mobile variant: it
  only depends on `streamx` and `b4a`, and the BareKit IPC object already is a `streamx`
  Duplex.
- `workers/main.js` is a one-line `require('hello-pear-worker')`. That package's
  `package.json#imports` maps the specifier `pear-runtime` to `pear-mobile` under the
  `ios`/`android`/`simulator` conditions and to desktop `pear-runtime` otherwise, which
  is how one worker body serves both this repo and hello-pear-electron. `bare-pack`
  resolves the condition at bundle time — the emitted `src/worker.bundle.js` contains
  `node_modules/pear-mobile/bare.js` and no desktop `pear-runtime`.
- **Because the worker lives in a package, it resolves against that package's
  `package.json`, not this one.** To develop the worker in-project instead, copy
  `hello-pear-worker/index.js` into `workers/main.js`; its Node-builtin usage then needs
  an `imports` entry here, and its dependencies become this repo's dependencies.
- `bare-pack` runs with `--linked` and four `--host` targets, so native addons resolve
  to `linked:` specifiers that `react-native-bare-kit` has prelinked as xcframeworks /
  `.so`s. Adding a worker dependency with a native addon that BareKit does not already
  vendor will bundle fine and then fail to link at runtime.
- Worklets are **suspended and resumed with the app**: `react-native-bare-kit` registers
  a global `AppState` listener that calls `suspend()` on `background` and `resume()` on
  `active` for every live worklet. Backgrounded P2P work stops; do not assume the swarm
  keeps replicating while the app is not foregrounded.
- **Nothing terminates the worklet.** `App.tsx`'s effect cleanup destroys the pipe but
  never calls `worklet.terminate()`, and the effect holds no reference to the worklet —
  `PearRuntime.run()` returns only the IPC. Every effect re-run (Fast Refresh, a remount)
  starts another worklet against the same storage directory, so two Corestores contend
  for the same files. Restart the app rather than trusting a hot reload when debugging
  worker behavior.
- The pipe protocol is plain UTF-8 strings matched by exact equality. The worker
  `console.log`s any frame it does not recognize; `App.tsx` silently drops any frame it
  does not recognize, including the `Hello from worker` greeting the worker sends on
  every boot.
- `console.log` inside the worklet does not reach the Metro console — BareKit writes it
  to the system log (`bare` identifier): `xcrun simctl spawn booted log stream` on iOS,
  `adb logcat` on Android. A worker that dies at boot therefore looks like a UI that
  simply never updates.
- **A stall is usually the network, not the code, and the two look identical.** An
  update that never arrives most often means the machine seeding it is unreachable:
  `pear seed <link> --json` prints `firewalled` and `natType`, and `natType: "Random"`
  is symmetric NAT, which defeats holepunching. Mobile networks make this more likely,
  not less. Before debugging app logic, confirm replication works at all.
