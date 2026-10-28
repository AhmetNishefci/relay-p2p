# AGENTS.md

Relay is a local-first shared field notebook built from the pinned Holepunch
Expo/React Native template. Its original demo UI is replaced by welcome/join,
notebook, activity, editor, entry/handoff and sharing screens; see `docs/PHASE5.md`
and `docs/PHASE8.md`. The
template's **peer-to-peer OTA updates** remain intact (no update server). Unlike the
desktop siblings, an OTA here replaces the **JavaScript bundle** the app boots from — native code still ships
through the App Store and Play Store, so this template carries a second version gate
(`pear.json` `updates.minver`) that the desktop templates do not need.

Stack: Expo SDK 55 (React Native 0.83, React 19, TypeScript), `react-native-bare-kit`
(Bare worklet), `pear-mobile` (dual export: RN side starts the worklet, Bare side owns
the updater), `pear-runtime-react-native` (Expo config plugin),
`hello-pear-worker` (copied into `workers/main.js`), Autopass 3.4.1, `framed-stream` + `b4a` for IPC, prettier +
lunte. CI lints and runs `npm test` (format check, lint, and Node foundation tests) on pushes to `main` and PRs
targeting `main`. [README](README.md) is the human
Android assessment run manual; optional OTA operations are in the pinned upstream README.

Key fact: **the updater never runs in React Native, and applying an update is not what
makes it take effect.** `src/worker/runtime.ts` owns one application-lifetime Bare worklet and exchanges UTF-8
frames with it — Corestore, Hyperswarm and the updater all live inside the worklet.
Applying an update writes `app.bundle` + `package.json` into
`<persistent>/pear-runtime/ota/`; which bundle actually boots is decided by **native
code the Expo config plugin patched into `AppDelegate.swift` and `MainApplication.kt`**,
which compares the OTA manifest version against the installed native version at launch
and on reload. Android's reload hook lives in the generated `modules/pear-runtime-reload/`
Expo module.
JavaScript cannot override that choice.

## Commands

```sh
npm ci
npm run bundle:bare          # REQUIRED before any run — builds src/worker.bundle.js
npm run ios                  # expo run:ios
npm run android              # expo run:android
npm run production:ios       # expo run:ios --configuration Release
npm run production:android   # expo run:android --variant release
npm run prebuild             # expo prebuild — regenerates ios/ and android/
npm run bundle:react-native  # RN bundles → out/<platform>/HelloPear/
npm run build                # pear-build → dist/ (includes pear.json)
npm run update               # bundle:bare && bundle:react-native && build
npm run lint                 # lunte
npm run format               # prettier . --write
npm test                     # formatting, lint, and foundation tests (= CI)
npm run test:foundation      # Node protocol/client and real Autopass tests
```

`src/worker.bundle.js` is a gitignored build artifact that `src/worker/runtime.ts` imports
directly. Nothing rebuilds it automatically: **after any change to `workers/main.js` or
to a package the worker pulls in, re-run `npm run bundle:bare`** or the app keeps
running the previous worker. A stale bundle fails silently — the app boots and the UI
looks normal.

Upstream commits the placeholder `pear://<YOUR_KEY_HERE>`; this assessment checkout
configures a real development link using `pear touch`. The placeholder does not survive a boot: `PearRuntimeUpdater`'s constructor calls
`link.parse(opts.upgrade)` unconditionally — it records the `updates` flag but never
lets it gate the parse — so the placeholder throws `ERR_INVALID_URL` and kills the
worklet at startup **even in development, where this template disables updates**. The original
demo never learned the worker died; Relay now reports bounded startup/request failures.
A working dev run still needs a real link from `pear touch` in `package.json`.

The pinned baseline uses registry dependencies and `npm ci` was verified in Phase 1.
Use the committed lockfile. Phase 2 adds Autopass 3.4.1 and promotes the copied
worker's dependencies at existing locked versions; no existing package/native-addon
versions changed. Never use broad upgrades to bypass native compatibility problems.

## Contracts: editing one side breaks the other, often silently

- Worker argv remains positional: `src/worker/runtime.ts` passes
  `[updates, version, upgrade, appName]`; `workers/main.js` retains the copied
  `argv = (i) => Bare.argv[i + (isBareKit ? 0 : 2)]` helper. Mobile supplies four args.
- Updates flag polarity: `src/worker/runtime.ts` sends `(!__DEV__).toString()` ↔ the worker computes
  `updates: argv(0) !== 'false'`. Development sends the string `'false'` and disables
  updates; release sends `'true'`. The value is a **string**, and any string other than
  `'false'` enables updates
- One FramedStream carries the original Pear UTF-8 control strings and versioned JSON
  application requests/responses/events. See `shared/protocol.js` / `.d.ts` and
  `docs/PHASE2.md`, `docs/PHASE3.md`, `docs/PHASE4.md`, and `docs/PHASE5.md`. Unknown or malformed application frames receive structured errors;
  entry bodies and raw internal errors are never logged as application requests.
- One version drives everything: `package.json#version` → `app.config.js` → Expo →
  iOS `CFBundleShortVersionString` / Android `versionName` → the native boot comparison,
  and the same `package.json` is copied into `dist/` by `pear-build` as the OTA
  manifest version. `app.config.js` replaces `app.json` outright (Expo reads the static
  file only via the `require` inside it) and exports `{ ...app.expo, version }`, so
  `package.json` always wins — a `version` in `app.json` is silently ignored. Deleting
  the require, the spread or the `version` key breaks the chain
- `pear-build`'s drive-root `package.json` ↔ `pear-mobile._writeManifest()` ↔ the
  `package.json` native boot reads beside `app.bundle`. The payload never carries that
  file: the per-host app directory holds only `app.bundle`, and the manifest is copied
  onto the device at update time. Native boot needs both files and silently falls back
  to the shipped bundle if either is missing
- `pear.json` `updates.minver` ↔ `pear-mobile`'s `_skipUpdate()`, which reads it from
  the drive root and skips the OTA when the running version is lower. The key is
  lowercase `minver` in the code; see `agent_docs/updates.md` before touching it
- App identity is one chain: `package.json#productName` (`HelloPear`) ↔ the
  `out/<platform>/HelloPear` output dirs in `bundle:react-native` ↔ the directory
  basename passed to each `pear-build --<host>` flag ↔ `by-arch/<host>/app/<name>/` in
  the Deployment Directory ↔ the `name` argv the updater uses to find its payload.
  `pear-build` validates app basenames against the package identity; the worker's
  name must still match the deployed directory
- `npm run build` passes `--config ./pear.json`: `pear-build` requires this config for
  mobile projects and copies it verbatim to `dist/pear.json` alongside `package.json`
  and the per-host app directories
- The Expo config plugin ↔ the generated `ios/` and `android/` folders, which are
  **gitignored**. The plugin patches native boot code during prebuild and is idempotent
  via a version marker, so native OTA behavior can only change by regenerating them
- `metro.config.js` merges RN and Expo defaults; `src/types.d.ts`
  hand-declares `b4a` and `framed-stream`, which ship no types of their own

## Boundaries

You are a tool assisting the maintainer, not a substitute for them. Exceptions to any
rule here are the human's call: when a task seems to require one, stop and surface the
conflict instead of working around it. Exceptions are expected to be rare.

- ✅ **Always:** if your change makes a _descriptive_ statement in AGENTS.md or
  `agent_docs/` false, update the doc and flag it in your summary; if it conflicts with
  a contract or boundary, stop and ask instead — never rewrite a rule to legalize your
  own change
- ✅ **Always:** re-run `npm run bundle:bare` after touching the worker or its
  dependencies, and check runtime changes in a **release** build
  (`npm run production:ios` / `production:android`). Development uses Metro and never
  exercises native OTA bundle selection, so `npm run ios` passing proves nothing about
  updates. Work is done when `npm test` passes and, for worker or update changes, a
  release build boots
- ⚠️ **Ask first:** `pear.json`, `package.json#version` or `productName`, new
  dependencies, Expo SDK bumps, and any change to when an update is applied or the app
  reloads
- 🚫 **Never:** deployment and publishing (`pear stage`, `pear provision`,
  `pear multisig`, `pear seed`, pushing `v*` tags — that triggers `publish.yml`),
  unless the user explicitly asked for exactly that in this session
- 🚫 **Never:** hand-edit `ios/` or `android/` — both are gitignored and regenerated by
  `expo prebuild`, so edits are lost and cannot be reviewed; change the config plugin or
  `app.json` instead. Never commit `src/worker.bundle.js`, or secrets

## Topic docs — match your task, read the doc BEFORE editing that area

Each `agent_docs/` file holds non-obvious, code-verified facts, including cross-package
contracts, failure semantics and dependency behavior; each opens with its own scope
statement. Routing:

- Editing `src/`, `workers/`, or `index.ts`, or debugging worklet startup, IPC or
  bundling → [`agent_docs/architecture.md`](agent_docs/architecture.md)
- Touching the update flow or update UI, `pear.json`, versioning, or debugging an
  update that never arrives or never takes effect
  → [`agent_docs/updates.md`](agent_docs/updates.md)
- Touching `app.json`, `app.config.js`, the build scripts or `.github/`; renaming the
  app; or cutting a native release or an OTA release
  → [`agent_docs/releases.md`](agent_docs/releases.md)
