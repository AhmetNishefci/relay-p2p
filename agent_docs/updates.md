# OTA update behavior

> Read before touching the update flow or update UI, `pear.json`, versioning, or when
> debugging an update that never arrives or never takes effect. Only non-obvious,
> code-verified facts — the code is the reference for everything else. Index:
> [AGENTS.md](../AGENTS.md).

Flow: stage a new build (as described in README) → the worklet's swarm replicates the
drive → the updater mirrors the payload into `pear-runtime/next/` → pipe frames flip the
UI → the user taps **Apply update** → the staged directory is swapped into
`pear-runtime/ota/` → **native boot code picks the bundle on the next launch.** The last
step is the one that decides what runs, and it is not JavaScript.

## Timing

- Immediate check when the updater opens; after a drive `append`, a check on a
  randomized delay drawn once per process (`opts.delay`, default ≤ 1 h). Appends within
  60 s of boot check immediately; each new append cancels and reschedules the pending
  check. Checks are debounced. Pass `delay: 0` for tests.
- Only a strictly-newer SemVer wins — `current.compare(remote) >= 0` returns early.
  **No downgrade path**; a rollback must be re-staged under a higher version.
- When the drive version equals the running version, the updater eagerly downloads the
  payload once (`_prefetchLatest`) so a later update applies faster. This is not a bug.
- Events the template does not use: `update-scheduled`, `updating-progress`,
  `updating-delta`, and `error` on the updater (the worker logs it to the system log).

## The minver gate — one real break, one already fixed

This is the mobile-only gate that stops an OTA needing new native code from landing on
a client that lacks it. As written today it still never reaches the UI:

1. **Casing: currently correct, historically wrong.** `pear-mobile`'s `_skipUpdate()`
   reads `JSON.parse(buffer).updates?.minver` from the drive's `/pear.json` —
   **lowercase** — and `pear.json` is now lowercase to match. Do not "normalize" it to
   `minVer`; that spelling silently disables the gate, because JSON keys are
   case-sensitive and the lookup then yields `undefined`. A dirty tree's `dist/pear.json`
   may still read `minVer` — that is a stale build artifact, overwritten by
   `npm run build`.
2. The signal still cannot reach the UI: `pear-mobile` emits
   `minver-required` on the `PearRuntime` instance, while `hello-pear-worker` listens
   for `update-incompatible` — a name nothing in `pear-runtime`, `pear-mobile`,
   `pear-runtime-updater` or `hello-pear-worker` ever emits. The `minver-required` pipe
   frame is therefore never written, and `App.tsx`'s "Update available on the App
   Store" state is unreachable.

Note also that `_skipUpdate` reads `pear.json` from the **drive head** while comparing
against the **running** app's version, which is the intended semantics: "this payload
needs at least native version X."

## Apply

- `applyUpdate()` is a no-op unless the updater is `updated`, not already `applied`, and
  `bundled`. It sets `applied = true` **before** the swap, so a failed apply cannot be
  retried in-process.
- The swap is `fsx.swap(<next>/by-arch/<host>/app/<name>, <persistent>/pear-runtime/ota)`
  — a directory swap, not a file copy.
- **The manifest is written on the device, not shipped.** `pear-build` copies
  `--package` to the _drive root_; `dist/by-arch/<host>/app/HelloPear/` contains only
  `app.bundle`. `pear-mobile` hooks the updater's `updated` event and copies the drive's
  `/package.json` into the staged app directory, so the manifest travels with the bundle
  into `pear-runtime/ota/`. Native boot requires **both** files, so a change to
  `_writeManifest`, to the drive-root `package.json`, or to the staged directory layout
  breaks OTA selection with no error anywhere.
- **Race:** `_writeManifest()` is async and nobody awaits it, and the worker's
  `pipe.write('updated')` runs immediately after it is kicked off. The UI can therefore
  offer **Apply update** before the manifest has been written; applying in that window
  produces an OTA directory whose `package.json` is missing, and native boot silently
  falls back to the shipped bundle because its guard requires both files.
- **A failed apply hangs the UI.** The worker has no try/catch around
  `await pear.updater.applyUpdate()` and never sends a failure frame; `App.tsx` parses a
  `pear:updateFailed` frame that nothing writes. Any throw leaves the button stuck on
  "Updating..." forever. Real update UX needs a try/catch plus a failure reply in the
  worker.

## Native boot selection — the part JavaScript cannot override

- The Expo config plugin patches `AppDelegate.swift` (`bundleURL()`) and
  `MainApplication.kt` (`jsBundleFilePath = pearOtaBundle(applicationContext)`), guarded
  by the shared `OTA v4` marker so re-running prebuild is idempotent.
  **Debug builds always use Metro** — OTA selection cannot be exercised in development
  at all.
- Both platforms require `app.bundle` **and** `package.json` to exist in the OTA dir,
  and take the OTA only when its manifest version is strictly greater than the installed
  native version. Equal never wins, so shipping a store release at or above the last OTA
  version naturally supersedes it.
- The comparators implement **full SemVer precedence, including prerelease ordering**
  (`1.0.0-alpha < 1.0.0`), and reject non-SemVer strings by returning "not newer".
  Earlier template versions ignored prerelease; do not repeat that claim.
- Paths line up because `bare-storage`'s `persistent()` returns exactly what the native
  code reads: `NSApplicationSupportDirectory` on iOS and `/data/user/0/<pkg>/files`
  (`context.filesDir`) on Android.
- **Both platforms re-read the bundle on reload.** iOS calls the delegate's
  `bundleURL` on every load. Android's generated local Expo module in
  `modules/pear-runtime-reload` supplies a host handler that repeats the same version
  check on every load. `reloadAppAsync()` therefore activates a freshly applied OTA
  on both platforms without restarting the process. Changing this native behavior
  requires prebuild and a new native binary.

## Seeding / replication

- The app joins the drive **client-only** and never seeds — run dedicated `pear seed`ers.
- `store.replicate` is registered **only when updates are enabled**, so app data in the
  worker's corestore will not replicate in development (where `__DEV__` sends
  `'false'`). When adding app P2P storage, hoist the
  `swarm.on('connection', (c) => store.replicate(c))` line out of the updates-gated
  block and join your app topic separately; only the updater-drive join stays gated.
