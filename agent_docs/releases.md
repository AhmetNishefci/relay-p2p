# Releases (`app.json`, `app.config.js`, build scripts, `.github/`)

> Read before touching `app.json`, `app.config.js`, the build scripts or `.github/`,
> before renaming the app, and when cutting either a native release or an OTA release.
> Only non-obvious, code-verified facts — the code is the reference for everything else.
> Index: [AGENTS.md](../AGENTS.md).

This template has **two release channels sharing one version sequence**: native builds
that go through the App Store and Play Store, and OTA payloads that replace only the
JavaScript bundle. `package.json#version` is the single source of truth for both, and
the rules for keeping them ordered are in [README](../README.md#version-management).

- `app.config.js` **fully replaces** `app.json` for Expo — `@expo/config` returns only
  the dynamic config when one exists, so `app.json` reaches Expo solely through the
  `require('./app.json')` on line 5. The export is `{ ...app.expo, version }`, with
  `version` spread last, so `package.json` always wins: a `version` added to `app.json`
  is silently **ignored**, not honoured. Verified by setting `app.json` to `9.9.9` and
  observing `npx expo config` still report `1.0.0`. The real hazard is deleting the
  require, the spread, or the `version` key — any of which drops the whole static config
  or desynchronizes the native version from the OTA manifest version that native boot
  compares against.
- `npm run bundle:react-native` writes `out/<platform>/HelloPear/app.bundle` plus
  assets. React Native bundles are architecture-agnostic within a platform, which is why
  `npm run build` passes the same `out/ios/HelloPear` directory to `--ios-arm64`,
  `--ios-arm64-simulator` and `--ios-x64-simulator`.
- `pear-build` copies each app directory selected by a `--<host>` flag: it
  mirrors `dirname(<path>)` with prefix `/<basename(<path>)>` into
  `<target>/by-arch/<host>/app/`, and copies `--package` to `<target>/package.json`.
  `--config ./pear.json` is required for mobile projects with `react-native-bare-kit`
  in their dependencies; the config is parsed and copied verbatim to
  `<target>/pear.json`. No separate copy command is needed.
  App basenames, with extensions removed, must match `productName` (falling back to
  `name`) or an object-form `package.json` `bin` key; otherwise the build throws
  `ERR_INVALID_APP_NAME`. The worker's name must still match the deployed directory
  (`/by-arch/<host>/app/<name>`).
- The Deployment Directory here is `dist/`, inside the project. It cannot nest inside
  itself — `pear-build` mirrors `out/<platform>/HelloPear`, never the project root — but
  `dist` is **also Expo's default `expo export --output-dir`**, which is why `.gitignore`
  lists it twice (lines 11 and 15). Never run `expo export` here without
  `--output-dir`, and treat `dist/` as disposable: a stale one holds an old
  `package.json` version and an old `pear.json` (the checked-out tree currently has one
  with `minVer: 1.0.2` from before the key was corrected).
- `pear.json` is copied into the drive verbatim. It currently carries only
  `updates.minver`; if a `multisig` block is added for production signing (as in
  hello-pear-electron), that block ships inside every OTA payload too.
- Native code, native dependencies and the config plugin **cannot ship over OTA**. Any
  change to `ios/`, `android/`, `app.json`'s plugins, or a dependency with native code
  requires a prebuild and a store release — and, if older clients must not take the new
  JavaScript, a `pear.json` minimum-version bump. See
  [`updates.md`](updates.md) for why that gate does not currently fire.
- `ios/`, `android/`, and `modules/pear-runtime-reload/` are gitignored and regenerated
  by `expo prebuild`. The config plugin's patches share the `OTA v4` marker, so
  re-running prebuild is idempotent,
  but a **stale** generated folder from an older plugin version keeps its old native boot
  code until it is regenerated. When update behavior looks wrong on device, confirm the
  native side is current before debugging JavaScript.
- CI (`.github/workflows/ci.yaml`) runs `npm run lint` on Ubuntu and `npm test` on a
  Bare base image — but both jobs install first, and `npm install` currently fails with
  `ENOENT` on the missing `hello-pear-worker` tarball, so CI is red regardless of the
  code. It does **not** build the app, run prebuild, or exercise the worker
  bundle — `npm test` is `prettier . --check && lunte`, and there are no unit tests.
  Prettier picks up `.gitignore` by default, which is why the 2 MB generated
  `src/worker.bundle.js` is not format-checked.
- `.github/workflows/publish.yml` publishes to npm on any `v*` tag — the tag shape
  `npm version` creates. This package is `private: true`, so such a tag produces a
  failing release job rather than a publish. Do not tag unless that is deliberate.
- The shared deployment flow (`pear touch` → `pear stage` → `pear provision` →
  `pear multisig`) is documented in [Pear Docs](https://docs.pears.com/how-to/operate-an-app/manual-deployment/deployment/).
  [README](../README.md#deployments) links to it and keeps the mobile OTA payload and
  versioning guidance. Deployment is never an agent's call.
