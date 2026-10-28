> **Assessment baseline:** imported from upstream commit `4ad3f8df5b5f20ce7621c42457795d53b2248c9b`.
> See [Android baseline setup and evidence](docs/PHASE1.md) and [AI assistance disclosure](docs/AI_USAGE.md).
> [Phase 2](docs/PHASE2.md) adds the persistent Autopass/IPC foundation and a minimal verification UI.
> [Phase 3](docs/PHASE3.md) adds Contributor/Viewer pairing and verified independent-peer replication.
> [Phase 4](docs/PHASE4.md) adds explicit peer acknowledgment records and their trust limits.
> Final Relay visual design is not implemented yet.

# hello-pear-react-native <a name="hello-pear-react-native"></a>

> Pear Hello World for React Native on mobile with `pear-mobile`

End-to-end boilerplate for embedding [pear-mobile][pear-mobile] into [React Native][react-native] apps and deploying peer-to-peer application updates.

- Peer-to-Peer Over-the-Air updates of the JavaScript bundle
- Embedded [Bare][bare] runtime worklets
- Application storage management
- Staged deployment pipeline with multisig production releases
- Native/OTA compatibility gating with `minver`

Built with [Expo][expo] SDK v55.

This is the mobile counterpart to [hello-pear-electron][hello-pear-electron]. The shared deployment flow lives in the [Pear docs][pear-deployments]. What differs on mobile:

- An OTA payload is a **JavaScript bundle per host**, not a set of native distributables — see [Build the OTA payload](#payload).
- Store releases and OTA payloads share **one SemVer sequence**, gated by `pear.json` `updates.minver` — see [Version management](#version-management).
- An update applies on relaunch through patched native boot code, not by restarting a runtime — see [OTA bundle loading](#ota-bundle-loading).

## MVP - EXPERIMENTAL

This boilerplate is MVP and Experimental.

## Table of Contents

- [OS Support](#os-support)
- [Requirements](#requirements)
- [Terminology](#terminology)
- [Development](#development)
  - [Install](#install)
  - [Set an upgrade link](#set-a-development-upgrade-link)
  - [Bundle the worker](#bundle-the-worker)
  - [Run](#run)
- [Architecture](#architecture)
  - [Updates](#updates)
  - [Storage](#storage)
  - [Workers](#workers)
  - [OTA bundle loading](#ota-bundle-loading)
- [Version management](#version-management)
  - [JavaScript-only OTA release](#js-only-release)
  - [Native release](#native-release)
- [Peer-to-Peer Deployments](#deployments)
  - [Build the OTA payload](#payload)
  - [Release lines on mobile](#mobile-release-lines)
- [Store Submissions](#store-submissions)
- [CI](#ci)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)

## OS Support <a name="os-support"></a>

- iOS
- Android

## Requirements <a name="requirements"></a>

- `npm` via [Node.js][nodejs] — `node --version` >= 20.19.4 (enforced by React Native 0.83 [more info](https://docs.expo.dev/versions/latest/#each-expo-sdk-version-depends-on-a-react-native-version))
- [`pear`][pear-docs] — `npx pear`, required for the deployment flow

#### For iOS <a name="requirements-ios"></a>

- `xcodebuild -version` >= 26.2 — Expo SDK 55 builds against a current Xcode. React Native's own hard floor is 16.1 (below it the build raises `Please upgrade XCode`), but that is not sufficient for this SDK
- iOS version >= 15.1 — React Native's minimum deployment target

#### For Android <a name="requirements-android"></a>

- Android version >= 10 (API 29) — [react-native-bare-kit][react-native-bare-kit] sets `minSdk 29`, mirrored by `expo-build-properties` in `app.json`

[more info](https://docs.expo.dev/versions/latest/#support-for-android-and-ios-versions)

## Terminology <a name="terminology"></a>

The shared deployment terms are defined in the [release pipeline glossary][pear-release-glossary]. The mobile-specific ones:

- **OTA** - Over-the-Air. Data delivery without manual intervention
- **OTA Updates** - Direct software updates to running applications without manual reinstallation. On mobile an OTA replaces the **JavaScript bundle only**; native code ships through the App Store and Play Store
- **P2P** - Peer-to-Peer. Direct point-to-point communication between machines/devices without central servers
- **application drive** - the [Hyperdrive][hyperdrive] behind a Pear application
- **Deployment Directory** - the build directory that is staged; here it is `dist/`
- **worklet** - an embedded [Bare][bare] runtime instance hosted by the React Native app
- **minver** - `pear.json` `updates.minver`, the oldest **native** version an OTA payload is compatible with
- **native release** - a build distributed through the App Store or Play Store
- **multisig** - a co-signing protocol requiring a quorum of signers before writes can be committed. This cryptographically binds project integrity to collective sign-off
- **pear link** - a [link format][pear-link-format] for addressing peer-to-peer applications
- **quorum** - the minimum number of signers needed to commit a multisig write
- **release lines** - parallel deployment streams at different stability levels
- **seeding** - exposing a drive to peers for discovery and download
- **versioned link** - a pear link of the form `pear://<fork>.<length>.<key>` where fork, length and key correspond to [core.fork][hypercore-fork], [core.length][hypercore-length] and [core.key][hypercore-key] of the [Hypercore][hypercore] behind the [Hyperdrive][hyperdrive]

## Development <a name="development"></a>

Two things must be in place before the app runs in any environment: a valid `upgrade` link and a freshly built worker bundle.

### Install <a name="install"></a>

```sh
npm install
```

### Set an upgrade link <a name="set-a-development-upgrade-link"></a>

The committed `upgrade` field may be the placeholder `pear://<YOUR_KEY_HERE>`. `pear-runtime-updater` parses the link **unconditionally in its constructor** — the `updates` flag is recorded but never gates the parse — so a placeholder throws `ERR_INVALID_URL` and kills the worklet at startup, even though this template disables updates in development. React Native never learns the worker died: the app renders its version and nothing else ever arrives.

`npm run ios` and `npm run android` therefore run `scripts/check-upgrade.js` before handing off to Expo — the mobile counterpart to the `readPackageJson` hook in hello-pear-electron's `forge.config.js`. It parses `package.json` `upgrade` with [pear-link][pear-link] and refuses to launch unless the result is a `pear://` link carrying a decodable drive key:

```
package.json#upgrade is not a valid link: pear://<YOUR_KEY_HERE> (Invalid URL)
Use `pear touch` to get a valid upgrade key for package.json#upgrade
```

Create a link and set it:

```sh
pear touch
```

```sh
npm pkg set upgrade=pear://qxenz5wmspmryjc13m9yzsqj1conqotn8fb4ocbufwtz9mtbqq5o
```

Committing a real development link is safe — the link only selects which drive the updater follows.

### Bundle the worker <a name="bundle-the-worker"></a>

```sh
npm run bundle:bare
```

Packs the worker for the BareKit runtime with [bare-pack][bare-pack], targeting iOS arm64, the iOS arm64 and x64 simulators, and Android arm64. The output, `src/worker.bundle.js`, is gitignored and is imported by `src/worker/runtime.ts`. Rerun it after every change to `workers/main.js` or to a package the worker imports: nothing rebuilds it automatically, and a stale bundle fails silently because the app still boots and the UI still looks normal.

### Run <a name="run"></a>

```sh
npm run ios       # expo run:ios
npm run android   # expo run:android
```

Development builds always load JavaScript from Metro, so OTA bundle selection is never exercised. Use the release variants to test updates:

```sh
npm run production:ios
npm run production:android
```

## Architecture <a name="architecture"></a>

The application architecture is tightly scoped to handling P2P OTA updates, running an embedded [Bare][bare] worklet and facilitating [Peer-to-Peer Deployment](#deployments) flows.

Peer-to-peer logic runs in the worklet, which acts as the local backend for the React Native view.

### Updates <a name="updates"></a>

An update occurs when the seeded application drive is written to with a higher version.

When an update occurs, the instance will emit either the events updating and updated — or the event minver-required.

```js
pear.updater.on('updating', () => {
  // update view to indicate updating in progress
})
```

```js
pear.updater.on('updated', () => {
  // update view to indicate application updated
})
```

#### Disabling Updates <a name="disabling-updates"></a>

Pass `--no-updates` flag to disable updates per application run.

To disable updates as an application default, ensure that the package.json is spread into the options (`{...pkg, ...}`) and set the `updates` field to `false`:

```json
{
  "version": "1.0.0",
  "updates": false
  ...
}
```

#### Applying <a name="ota-update-flow"></a>

A running application will receive `updating` and `updated` events, which are sent to react-native via the framed `Bare.IPC` pipe. This example waits for the user to press **Apply update** rather than applying automatically, and calls `reloadAppAsync()` once the swap is done. This swaps the current saved OTA bundle path with a path to the updated bundle and then removes the old bundle from disk. So once the react-native rendere is restarted, the native code can start the bridge from the new bundle.

The third event an application can receive is `minver-required`, forwarded the same way and used to prompt the user to update from the App Store or Play Store — see [How `minver` is enforced](#minver).

### Storage <a name="storage"></a>

Storage is provided by `pear-mobile` inside the worklet. The default directory is the platform's persistent application-data directory, and `pear.storage` defaults to its `app-storage` child:

- iOS: the app's Application Support directory
- Android: the app's `files` directory

These are the same locations the patched native boot code reads the OTA bundle from, which is what makes the applied update visible to the next launch. Any custom directory must also be persistent.

The worklet keeps `pear-runtime/corestore`, `pear-runtime/next/<length>.<fork>/` (the staged payload) and `pear-runtime/ota/` (the installed payload) under that directory.

### Workers <a name="workers"></a>

Upstream ships its worker in [hello-pear-worker][hello-pear-worker]. This assessment
copies its installed 1.1.0 body into `workers/main.js`, switches its runtime require
to `pear-mobile`, and adds the isolated Autopass service. The snippet below describes
the original template entry; see [Phase 3](docs/PHASE3.md) for the current worker:

```js
require('hello-pear-worker')
```

That package's `imports` map resolves the specifier `pear-runtime` to `pear-mobile` on iOS, Android and simulators, and to the desktop `pear-runtime` elsewhere. To develop the worker in-project instead, copy `hello-pear-worker/index.js` into `workers/main.js`; it then resolves against this `package.json`, so any Node builtins it uses need an `imports` entry here.

The React Native side starts it with the static `PearRuntime.run()` from `pear-mobile` and gets back the worklet's IPC duplex:

```js
import PearRuntime from 'pear-mobile'
import bundle from './worker.bundle.js'

const IPC = PearRuntime.run('/worker.bundle', bundle, argv)
```

The other side of that stream is `Bare.IPC` inside the worker. The IPC duplex emits plain `Uint8Array` chunks rather than Buffers, so decode with `b4a.toString(data)` — `data.toString()` yields a comma-joined byte list.

`console.log` inside the worklet goes to the system log, not the Metro console: use `xcrun simctl spawn booted log stream` on iOS or `adb logcat` on Android.

### OTA bundle loading <a name="ota-bundle-loading"></a>

The project is already configured to load the OTA bundle when present. No manual native edits are required.

**app.json** – the [pear-runtime-react-native][pear-runtime-react-native] Expo config plugin is registered in `expo.plugins`:

```json
"plugins": [
  ["pear-runtime-react-native"],
  ...
]
```

**metro.config.js** – extends both the React Native and Expo defaults, which is what `npx react-native bundle` uses to produce OTA payloads.

```js
const { getDefaultConfig: getRNConfig, mergeConfig } = require('@react-native/metro-config')
const { getDefaultConfig: getExpoConfig } = require('expo/metro-config')

module.exports = mergeConfig(getRNConfig(__dirname), getExpoConfig(__dirname))
```

**What the plugin does** – during prebuild the config plugin patches the generated Swift `AppDelegate` and Kotlin `MainApplication`, guarded by a version marker so re-running prebuild is idempotent. Debug builds continue to use Metro. On a release launch, native code reads `pear-runtime/ota/app.bundle` and the adjacent `package.json` from the [storage directory](#storage).

The OTA bundle is selected only when both files exist and its manifest version is greater than the installed native version. An equal version never overrides the native bundle, so installing a newer store release naturally supersedes an older OTA.

`ios/` and `android/` are gitignored and regenerated by `expo prebuild`, so a folder left over from an older plugin version keeps its old boot code — regenerate before concluding that an update problem is in JavaScript.

## Version management <a name="version-management"></a>

Native releases and OTA releases share one monotonically increasing [SemVer][semver] sequence. `package.json` `version` is the single source of truth and the only version that should be edited. It reaches three places:

- **The native build.** `app.config.js` exports `{ ...app.expo, version }`, so Expo writes it to iOS `CFBundleShortVersionString` and Android `versionName` during prebuild. A `version` set in `app.json` is ignored.
- **The OTA payload.** `npm run build` copies `package.json` into `dist/`. That copy's `version` is what the updater compares and what is stored beside the installed bundle.
- **The compatibility floor.** `pear.json` `updates.minver` is the oldest **native** version the payload runs on — not the payload's own version.

Comparison is full SemVer precedence including prerelease ordering (`1.0.0-alpha` < `1.0.0`) on both the Bare and the native side. Anything that is not valid SemVer counts as "not newer" and is never selected.

The ordering rules:

1. Every OTA version must be greater than the installed native version and every previously published OTA version.
2. Every new native release must be greater than every previously published OTA version, or an older OTA keeps overriding the newly installed native bundle.
3. Never reuse or decrease a published version.

Example: native `1.0.0` can receive OTA `1.0.1`, then OTA `1.1.0`. The next native release must be greater than `1.1.0` — choosing `2.0.0` with `minver` `2.0.0` stops older clients applying updates that need the new native runtime.

### How `minver` is enforced <a name="minver"></a>

`pear-mobile` gives the updater a `skipUpdate` hook that reads `/pear.json` from the drive before taking an update:

- running native version **>=** `minver` — the update proceeds.
- running native version **<** `minver` — nothing is downloaded and `minver-required` is emitted with `{ minver, version }`.

The gate travels inside the payload's own `pear.json`, so it applies from the moment that payload is staged and cannot be retro-fitted onto one already picked up.

### JavaScript-only OTA release <a name="js-only-release"></a>

1. Bump `package.json` `version`.
2. Leave `pear.json` `updates.minver` unchanged.
3. `npm run update`, then stage and seed `dist/`.

### Native release <a name="native-release"></a>

For a release that changes native code, native dependencies, or the OTA/native contract:

1. Choose a `version` greater than every previous native and OTA release.
2. Set `pear.json` `updates.minver` to that same version.
3. `npm run prebuild`, then build and publish the native release — generated `ios/` and `android/` keep the old version until they are regenerated.
4. `npm run update`, then stage and seed.

Step 4 does not have to wait for the store release: clients below `minver` skip the payload and are prompted to update from the store instead.

## Peer-to-Peer Deployments <a name="deployments"></a>

Use the [`pear`][pear-docs] CLI to deploy applications.

The shared release flow — stage, provision, and multisig — plus the Foundational Steps and release lines now live in the Pear docs:

- [Deploy your application][pear-deployments] — the Foundational Steps, command by command
- [Release pipeline][pear-release-pipeline] — how staging, provisioning, multisig, and release lines fit together

On mobile, **steps 3 and 4 become [Build the OTA payload](#payload)**: `npm run update` bundles the JavaScript and assembles `dist/`. Follow [Version management](#version-management) for the shared native/OTA version sequence, and [Store Submissions](#store-submissions) for native binaries. The remaining deployment steps use `dist` as the Deployment Directory.

The Foundational Steps bootstrap the deployment and then feed into the repeating release cycle:

```mermaid
graph TD
    subgraph Link Setup
        T(0. Touch & Seed) --> U(1. Set upgrade link)
    end

    U -.-> V

    V(2. Version) --> Make(3. Bundle JavaScript)
    Make --> Build(4. Build Deployment Directory)
    Build --> Stage(5. Stage)
    Stage -->|iterate| V
    Stage -->|stable| Prov(6. Provision)
    Prov -->|assessed| Req(7d. Prepare Request)
    Req --> Sign(7e. Sign)
    Sign --> Verify(7f. Verify)
    Verify --> Commit(7g. Commit)
    Commit --> Live[Production Live]
    Live -->|next release| V

    K(7a. Create Signing Keys) --> C(7b. Create Multisig Config)
    Prov -->|setup| C
    C --> L(7c. Set upgrade to Multisig Link)
    L --> Req
```

### Build the OTA payload <a name="payload"></a>

Checklist:

- `package.json` `version` bumped and `pear.json` `updates.minver` set for this release
- `package.json` `upgrade` set to the release line's link
- `package.json` `author`, `license`, `description`, `name` and `productName` set per brand
- `app.json` icons, `ios.bundleIdentifier` and `android.package` set per brand

```sh
npm run update
```

React Native bundles are architecture-agnostic within a platform, so the same iOS directory is supplied for the device and both simulator hosts:

```
dist/
  package.json
  pear.json
  by-arch/
    ios-arm64/app/HelloPear/app.bundle
    ios-arm64-simulator/app/HelloPear/app.bundle
    ios-x64-simulator/app/HelloPear/app.bundle
    android-arm64/app/HelloPear/app.bundle
```

The `build` script passes `--config ./pear.json` to `pear-build`, which copies it verbatim to `dist/pear.json` alongside `package.json`. This includes `updates.minver` and any [multisig config][pear-multisig-config]; editing the `multisig` block derives a different production key, editing `minver` does not.

> [!IMPORTANT]
> The `HelloPear` leaf is `package.json` `productName`, and it must match in three places: the `out/<platform>/HelloPear` paths in `bundle:react-native`, the directory basename passed to each `pear-build --<host>` flag, and the name the app passes into the worker. `pear-build` validates the app basename against the package identity, but the worker's name must still match: the updater looks for exactly `/by-arch/<host>/app/<productName>`.

`dist/` is then a Deployment Directory in the standard `package.json` + `by-arch/<host>/app` shape:

```sh
pear stage pear://qxenz5wmspmryjc13m9yzsqj1conqotn8fb4ocbufwtz9mtbqq5o dist
```

### Release lines on mobile <a name="mobile-release-lines"></a>

[Release lines][pear-release-lines] and [release line builds][pear-release-line-builds] work as on desktop, except that `upgrade` is compiled into the native build: a line is pinned to the build its users have installed, and no OTA can move them to another line.

| Release line | Native build its users run     | OTA source |
| ------------ | ------------------------------ | ---------- |
| development  | locally-built release variant  | stage link |
| staging      | internally distributed build   | stage link |
| rc           | TestFlight / internal testing  | stage link |
| prerelease   | TestFlight / internal testing  | provision  |
| production   | App Store / Play Store release | multisig   |

As on desktop the rc line's `upgrade` points at the production multisig link, so rc and prerelease builds receive no OTAs — each iteration is a new build. A line's `minver` must never exceed the native version its users run, or every payload on that line is skipped.

## Store Submissions <a name="store-submissions"></a>

This template carries no store configuration beyond `app.json` (`ios.bundleIdentifier`, `android.package`, icons and splash); signing, provisioning profiles and store metadata are project-specific, and no EAS or CI release workflow is set up here. Build from the generated `ios/` and `android/` projects with the usual platform tooling.

Store review can take days, and a payload staged during that window must not require the unreleased native build — see [Native release](#native-release).

## CI <a name="ci"></a>

`.github/workflows/ci.yaml` runs `npm run lint` on Ubuntu and `npm test` on a Bare base image for pushes to `main` and pull requests targeting `main`. It does not build the app, run prebuild, or exercise the worker bundle, and local protocol/client/Autopass foundation tests run through `npm test`.

`.github/workflows/publish.yml` publishes to npm on any `v*` tag — the tag shape `npm version` creates. This package is `private: true`, so such a tag produces a failing release job rather than a publish.

Signed native builds are not configured here; [hello-pear-electron: CI Configuration][electron-ci] covers the desktop equivalent.

## Scripts <a name="scripts"></a>

- `npm run ios` / `npm run android` - validate `package.json` `upgrade`, then `expo run:ios` / `expo run:android`
- `npm run production:ios` / `npm run production:android` - the same in release mode
- `npm run check:upgrade` - run the `upgrade` link check on its own ([pear-link][pear-link])
- `npm run prebuild` - `npx expo prebuild`; regenerates `ios/` and `android/` and applies the config plugin
- `npm run bundle:bare` - pack the Bare worker into `src/worker.bundle.js` with [bare-pack][bare-pack]
- `npm run bundle:react-native` - write the iOS and Android JavaScript bundles to `out/`
- `npm run build` - assemble `dist/` with [pear-build][pear-build], including `package.json`, `pear.json`, and the per-host OTA payloads
- `npm run update` - `bundle:bare`, `bundle:react-native` and `build` in sequence
- `npm run lint` - `lunte`; does not check formatting
- `npm run format` - `prettier . --write`; does not fix lint issues
- `npm test` - formatting, lint, and `npm run test:foundation`
- `npm run test:foundation` - Node protocol/client tests and real local Autopass integration tests

## Troubleshooting <a name="troubleshooting"></a>

Deployment-side problems — lost write access, unexpected `pear stage` size increases, `INCOMPATIBLE_SOURCE_AND_TARGET` on commit, unreachable seeders — are covered in [Pear Docs: Troubleshoot desktop releases][pear-release-troubleshooting].

### The app shows its version and nothing else <a name="app-shows-version-only"></a>

The worklet died at boot. Check the system log — nothing surfaces in the Metro console. The usual cause is an invalid `upgrade` link in a build made outside `npm run ios` / `npm run android`, which skips the check.

### The app did not update <a name="app-did-not-update"></a>

- Was `package.json` `version` bumped? An equal version is never selected.
- Is the `upgrade` link correct, and is the drive seeded?
- Was `npm run bundle:bare` re-run after the worker changed?
- Is this a debug build? Debug always loads from Metro.
- Was the app opened before the seeder came online? Peer lookups repeat roughly every 15 minutes — see [Seeder came online after the client][pear-seeded-after-open].
- On Android, was the app fully relaunched rather than reloaded? iOS re-reads the bundle URL on every reload; Android captures it when its `ReactHost` is first created.

### The app says "Update available on the App Store / Play Store" <a name="minver-required"></a>

The payload's `minver` is higher than the running native version, so it was skipped by design — see [How `minver` is enforced](#minver).

### An update downloaded but the app still runs the old bundle <a name="old-bundle-still-running"></a>

Native boot selection rejected it. Both `app.bundle` and `package.json` must be present under `pear-runtime/ota/`, and `ios/`/`android/` must have been regenerated with the current plugin.

### The updater never sees a peer <a name="no-peers"></a>

`pear seed <link> --json` prints `firewalled` and `natType`; `natType: "Random"` is symmetric NAT, which defeats holepunching. Seed from a host with a public address or cone NAT.

## LICENSE

Apache-2.0

<!-- Reference Links -->

[pear-mobile]: https://github.com/holepunchto/pear-mobile
[hello-pear-worker]: https://github.com/holepunchto/hello-pear-worker
[hello-pear-electron]: https://github.com/holepunchto/hello-pear-electron
[bare]: https://github.com/holepunchto/bare
[nodejs]: https://nodejs.org
[pear-docs]: https://docs.pears.com
[hyperdrive]: https://github.com/holepunchto/hyperdrive
[hypercore]: https://github.com/holepunchto/hypercore
[hypercore-fork]: https://github.com/holepunchto/hypercore#corefork
[hypercore-length]: https://github.com/holepunchto/hypercore#corelength
[hypercore-key]: https://github.com/holepunchto/hypercore?tab=readme-ov-file#corekey
[pear-link-format]: https://github.com/holepunchto/pear-link?tab=readme-ov-file#pear-link-format
[pear-runtime-react-native]: https://github.com/holepunchto/pear-runtime-react-native
[pear-build]: https://github.com/holepunchto/pear-build
[pear-link]: https://github.com/holepunchto/pear-link
[bare-pack]: https://github.com/holepunchto/bare-pack
[react-native-bare-kit]: https://github.com/holepunchto/bare-kit
[expo]: https://docs.expo.dev
[react-native]: https://reactnative.dev
[semver]: https://semver.org
[pear-deployments]: https://docs.pears.com/how-to/operate-an-app/manual-deployment/deployment/
[pear-release-pipeline]: https://docs.pears.com/explanation/deployment-releasing-apps-p2p/
[pear-release-glossary]: https://docs.pears.com/explanation/deployment-releasing-apps-p2p/#glossary
[pear-multisig-config]: https://docs.pears.com/how-to/operate-an-app/multisig/set-up-multisig/#create-the-multisig-config
[pear-release-lines]: https://docs.pears.com/explanation/deployment-releasing-apps-p2p/#release-lines
[pear-release-line-builds]: https://docs.pears.com/how-to/operate-an-app/manual-deployment/deployment/#release-lines-and-multiple-stage-drives
[pear-release-troubleshooting]: https://docs.pears.com/how-to/operate-an-app/manual-deployment/troubleshoot-desktop-releases/
[pear-seeded-after-open]: https://docs.pears.com/how-to/operate-an-app/manual-deployment/troubleshoot-desktop-releases/#seeder-came-online-after-the-client
[electron-ci]: https://github.com/holepunchto/hello-pear-electron#ci-configuration

## DECISIONS

1. **Sync state.** Completed local writes say “Saved on this device.” An update event
   does not establish remote delivery. We chose this over a generic “synced” badge
   because Autopass exposes no per-entry delivery acknowledgment. This sacrifices a
   simple global status. Explicit acknowledgment records are implemented as a
   separate replicated action; they are not delivery/read receipts or verified
   identities. See [Phase 4](docs/PHASE4.md) for tested behavior and trust limits. A reliable delivery API or evidence that users
   need a different distinction would change this decision.
2. **Pairing and trust.** Invite possession grants access; the inviter selects
   Contributor or Viewer, and the joined peer displays its actual capability.
   Names are unverified and there are no owner/admin claims. We chose capability
   sharing over silent admission or an account/identity system, sacrificing verified
   human identity and fine-grained sharing. New identity requirements or invitation
   abuse would change the choice. Options, tests, limitations, and implementation
   details are documented in [Phase 3](docs/PHASE3.md#pairing-and-trust-decision).
