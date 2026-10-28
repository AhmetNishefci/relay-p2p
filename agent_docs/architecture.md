# Architecture notes (`src/`, `workers/`, bundling)

> Read before editing `src/`, `workers/` or `index.ts`, or when debugging worklet
> startup, IPC or bundling. Only non-obvious, code-verified facts — the code is the
> reference for everything else. Index: [AGENTS.md](../AGENTS.md).

React Native screens (`src/App.tsx`, sharing/handoff components) →
`src/useNotebook.ts` (one mounted controller, coalesced entry snapshots) → one app-lifetime client (`src/worker/runtime.ts`)
↔ `FramedStream` over BareKit IPC ↔ Bare worker (`workers/main.js`: copied updater
scaffolding plus an isolated Autopass notebook). The code is small — read it for the wiring; below are only the non-obvious
facts.

- **Two packages expose a `PearRuntime`, and they are not interchangeable.**
  `pear-mobile` has an `exports` condition map: React Native resolves to
  `react-native.js` (a **static** `PearRuntime.run(filename, bundle, argv)` that starts a
  Worklet and returns its IPC), while Bare resolves to `bare.js` (the updater/storage
  class). `pear-runtime-react-native` also ships a runtime class, but its `run` is an
  **instance** method (`new PearRuntime().run(...)`). This project uses `pear-mobile`
  for the runtime and uses `pear-runtime-react-native` as an Expo config plugin,
  never as a runtime import. Metro merges React Native and Expo defaults.
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
- `workers/main.js` copies installed `hello-pear-worker` 1.1.0 and directly requires
  `pear-mobile`. Copying loses the package's mobile import remap, so retaining the
  desktop `pear-runtime` require would be incorrect. Its direct dependencies are
  declared at the original lockfile versions.
- `workers/library.js` selects one active store using `relay/active.json`. It adopts
  the Phase 2 `relay/notebook` directory in place, creates fresh `notebooks/<id>`
  stores, and uses a fresh `joins/<id>` directory for every attempt. Existing active
  stores cannot be replaced by Create/Join. Autopass remains in `workers/notebook.js`,
  separate from the updater store. See `docs/PHASE3.md` for activation/cancellation.
  Startup awaits `pass.ready()`. Requests are validated in `shared/protocol.js` and
  dispatched by `workers/requests.js`; mutations and list snapshots are serialized.
  `get()` returns `{ value, file }` or null; `list()` is consumed with `for await`.
- Acknowledgments are separate `ack:<entry-id>:<writer-key>` records. Bare derives the
  local key and rejects Viewer writes. The single entry snapshot includes validated
  acknowledgments/local key; existing update refreshes cover both record kinds.
  Deleted-entry acknowledgments are retained but hidden. Shared Autopass writers
  can overwrite each other's keys, so these are record claims, not authenticated
  receipts. See `docs/PHASE4.md` before changing handoff semantics.
- `bare-pack` runs with `--linked` and four `--host` targets, so native addons resolve
  to `linked:` specifiers that `react-native-bare-kit` has prelinked as xcframeworks /
  `.so`s. Adding a worker dependency with a native addon that BareKit does not already
  vendor will bundle fine and then fail to link at runtime.
- Screen presentation is keyed by route to reset scroll/press state. The controller
  stays mounted above that subtree; navigation does not create a worklet or replace
  the FramedStream. UI mutations use a synchronous ref guard in addition to disabled
  controls; worker validation/permissions remain authoritative.
- Worklets are **suspended and resumed with the app**: `react-native-bare-kit` registers
  a global `AppState` listener that calls `suspend()` on `background` and `resume()` on
  `active` for every live worklet. Backgrounded P2P work stops; do not assume the swarm
  keeps replicating while the app is not foregrounded.
- `PearRuntime.run()` exposes only IPC, not a Worklet handle. The application-lifetime
  session is retained on `globalThis` to prevent a second worker on component remount
  or Fast Refresh. Screen cleanup removes subscriptions/refresher callbacks, not the
  shared pipe. Disconnection rejects pending requests and requires a full app restart;
  never spawn a replacement worker against a store whose owner may still be alive.
- Pipe close/graceful goodbye invoke idempotent worker cleanup, close Autopass and its
  Corestore, and preserve cleanup of the template updater/swarm/store. Forced OS
  termination cannot guarantee JS cleanup; restart persistence must be tested.
- Pear control strings remain separate from JSON application frames on the same pipe.
  The client correlates IDs, validates results, bounds waits, and coalesces list refreshes.
  Background events use `invalidate()` without allocating waiting callers. An explicit
  `refresh()` waits for a read started after that call; subsequent invalidations cannot
  extend its wait until global quiet. There is still only one active read, with at most
  one pending waiter batch for the following read. Closing rejects waiting callers and
  suppresses callbacks from a late response. A failed reconciliation read does not undo
  a locally completed mutation.
  JSON application messages retain the 2M UTF-16-code-unit ceiling and also have a
  4,600,000-byte UTF-8 ceiling. The latter preserves the 1.5M-character normalized
  snapshot allowance at worst-case UTF-8 width plus envelope overhead. It is not a
  new lower notebook quota. Both senders validate before IPC; receivers validate before
  JSON parsing. FramedStream/native buffers already exist by receive time, so this
  does not claim protection against a compromised raw IPC writer's frame allocation.
  Foreign stored values use the same parse budget and are counted as skipped without
  deleting data. Unencodable responses become correlated `RESPONSE_UNAVAILABLE`
  failures: the operation may already have completed and must not be replayed.
  An Autopass `update` is a local-view change, never a remote delivery acknowledgment.
  See `docs/PHASE2.md` for schemas, limits, and actual runtime evidence.
- `console.log` inside the worklet does not reach the Metro console — BareKit writes it
  to the system log (on this emulator the process tag is `pearreactnative`; also check `bare`): `xcrun simctl spawn booted log stream` on iOS,
  `adb logcat` on Android. A worker that dies at boot therefore looks like a UI that
  simply never updates.
- **A stall is usually the network, not the code, and the two look identical.** An
  update that never arrives most often means the machine seeding it is unreachable:
  `pear seed <link> --json` prints `firewalled` and `natType`, and `natType: "Random"`
  is symmetric NAT, which defeats holepunching. Mobile networks make this more likely,
  not less. Before debugging app logic, confirm replication works at all.
