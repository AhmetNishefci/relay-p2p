# Phase 1: official template and Android baseline

## Provenance and scope

Imported the official source archive from
[`holepunchto/hello-pear-react-native`](https://github.com/holepunchto/hello-pear-react-native)
at exact commit [`4ad3f8df5b5f20ce7621c42457795d53b2248c9b`](https://github.com/holepunchto/hello-pear-react-native/tree/4ad3f8df5b5f20ce7621c42457795d53b2248c9b).
The import preserved the existing repository and `.nvmrc`; no history was replaced
or synthesized. Upstream `LICENSE`, `NOTICE`, UI, worker, and lockfile are retained.

Only the development upgrade identifier, ignore rules, and assessment documentation
were changed relative to the source archive. `AGENTS.md` describes the now-configured
upgrade field. No Autopass dependency, Relay screens, new Corestore, pairing, or
custom IPC implementation is included. See [AI assistance disclosure](AI_USAGE.md).

## Verified toolchain

| Component                 | Version                            |
| ------------------------- | ---------------------------------- |
| Node                      | 22.23.3 (`.nvmrc`)                 |
| npm                       | 10.9.9                             |
| JDK                       | Homebrew OpenJDK 17.0.20.1         |
| React                     | 19.2.0                             |
| React Native              | 0.83.2                             |
| Expo                      | 55.0.29                            |
| react-native-bare-kit     | 0.12.3                             |
| pear-mobile               | 4.3.0                              |
| pear-runtime-react-native | 3.0.1                              |
| hello-pear-worker         | 1.1.0                              |
| Pear runtime CLI          | 3.6.0 (invoked through `npx pear`) |
| Android emulator          | API 36, Google APIs, ARM64         |
| App compile/target SDK    | 36; minimum SDK 29                 |
| App NDK                   | 27.1.12297006                      |

The library build additionally installed NDK 27.0.12077973 and Android platform 34
through Gradle's SDK manager. Both NDK versions are installed side by side.
These are toolchain downloads, not JavaScript dependency upgrades.

## Reproduce on macOS / Android

Install Node 22.23.3, JDK 17, Android SDK/platform tools, API 36, NDK 27.1,
and an API 36 ARM64 AVD. Additional library SDK/NDK components may be downloaded
by Gradle. Ensure Android SDK licenses have been accepted.

```sh
nvm use
node --version
npm --version
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
java -version
npm ci
npx --yes pear -v
npm run check:upgrade
npm run bundle:bare
emulator -list-avds
emulator -avd Tether_API_36_ARM64 -no-snapshot-save
```

Use another terminal with the same Node/JDK/Android environment:

```sh
adb devices -l
adb shell getprop sys.boot_completed
npm run android
```

The emulator name above is local; use the name from `emulator -list-avds` on another
machine. Confirm an actual connected device and boot completion; an AVD directory
alone does not mean an emulator is running. With one connected emulator, the
unmodified `npm run android` command selects it.

`JAVA_HOME` above is this Apple Silicon Homebrew installation's path; adjust it to
an installed JDK 17 elsewhere. macOS `java_home` did not discover this JDK, so the
explicit environment variable was retained.

The committed upgrade link is a public development project identifier and can be
used to reproduce this baseline. It is not a signing secret. To generate a different
one, run the assessment's `npx --yes pear touch`, use its generated key exactly once
in `pear://<key>`, set `package.json#upgrade`, and rerun `npm run check:upgrade`.
Pear 3.6.0 actually prints a full link followed by guidance; the unique generated key
was extracted from that output rather than assuming its final line contains a key.
No stage, seed, provision, or publishing operation was performed.

Re-run `npm run bundle:bare` after any worker or imported-worker dependency change;
Metro does not regenerate `src/worker.bundle.js` automatically.

Release verification uses the supported template command:

```sh
npm run production:android -- --no-bundler
```

Metro's bundling engine runs during release compilation to create embedded assets;
this does not require a Metro development server when the installed app launches.
Stop the project's debug Metro process, remove ADB reverse forwarding if present,
then force-stop and reopen the release app to check standalone behavior.
The generated release uses the template's development signing configuration; this
is a local baseline APK, not a production-signed store release.

## Executed commands and evidence

Date: October 28, 2026 (Kosovo / CET). Raw logs and screenshots are local and
excluded from Git under `.assessment-local/`.

| Command/check                                | Actual result                                                               | Local evidence                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Preflight Git inspection                     | Empty `main`, no commits; only `.nvmrc` untracked                           | Codex transcript                                                             |
| Node/JDK/SDK/disk checks                     | Node 22 available; JDK 17; API 36/NDK 27.1; approximately 786 GiB available | Codex transcript                                                             |
| `adb devices -l` before launch               | No connected devices                                                        | Codex transcript                                                             |
| Start ARM64 AVD; check ADB/boot property     | `emulator-5554` connected; boot completed `1`                               | `emulator.log`, transcript                                                   |
| `npm ci`                                     | Passed: 932 packages added; no lockfile change                              | `npm-ci.log`                                                                 |
| `npm audit --json`                           | 27 findings: 9 low, 4 moderate, 13 high, 1 critical                         | `npm-audit.json`                                                             |
| `npx --yes pear --version`                   | Unsupported flag after bootstrap; correct flag is `-v`                      | `pear-version.log`                                                           |
| `npx --yes pear -v`                          | Passed; runtime 3.6.0                                                       | `pear-version-success.log`                                                   |
| `npx --yes pear touch`                       | Generated the configured development identifier                             | `pear-touch.log`                                                             |
| `npm run check:upgrade`                      | Passed                                                                      | `check-upgrade.log`                                                          |
| `npm run bundle:bare`                        | Passed                                                                      | `bundle-bare.log`                                                            |
| `npm run android -- --device emulator-5554`  | Expo rejected the ADB serial as a device name; no dependency fix needed     | Codex transcript                                                             |
| `npm run android`                            | Build succeeded in 1m 27s; installed and launched                           | `android-debug-build.log`                                                    |
| Original debug UI                            | Green template screen renders `v1.0.0`                                      | `debug-original.png`                                                         |
| Worker startup                               | Logs managed application storage directory                                  | `debug-original-runtime.log`                                                 |
| Worker to RN IPC                             | Received original `Hello from worker` greeting                              | `debug-ipc.log`                                                              |
| RN to worker IPC                             | Worker logged `phase1-ipc-probe` through existing unknown-frame handler     | `debug-ipc.log`                                                              |
| `npm test` before assessment docs            | Passed (formatting and lint)                                                | `npm-test-initial.log`                                                       |
| `npx tsc --noEmit`                           | Passed                                                                      | `tsc-initial.log`                                                            |
| `npm run production:android -- --no-bundler` | Release build passed in 58s; installed and opened                           | `android-release-build.log`                                                  |
| Standalone cold launch                       | Passed: no Metro listener or ADB reverse; UI renders; worker logs storage   | `release-runtime.log`, `release-standalone.png`, `release-verification.json` |

To observe IPC without changing the worker, two temporary UI diagnostic lines logged
the existing greeting and sent an unknown string to the worker's existing console
branch. They were removed before release compilation. `src/App.tsx` was restored
byte-for-byte (SHA-256 `fe5ae0804118731042306cb4938da35e668134000bd31218740e596e0dce0ab0`).
No new message protocol or retained diagnostic code was added.

A second fetch of the exact official source archive confirmed 25 upstream files
remain byte-identical. Only `.gitignore`, `AGENTS.md`, `README.md`, and `package.json`
differ; added files are `.nvmrc` and the assessment documentation. The comparison
is recorded in `.assessment-local/upstream-comparison.json`. The release package
is not debuggable, its process logged worker storage on cold launch, and the
observed screen renders `v1.0.0`. No fatal native addon error was observed in the
captured debug/release process logs. No actual OTA download/apply was exercised.

The requested `adb logcat -s bare` filter was checked. On this emulator the worker's
console output uses the process tag `pearreactnative`, so process-scoped logs provide
the actual startup/probe evidence. Use the application's PID to avoid confusing
unrelated Android system errors with application errors:

```sh
adb shell pidof com.anonymous.hellopearreactnative
adb logcat --pid=<actual-pid>
```

## Warnings and limits

- npm audit findings belong to the assessment's historical dependency tree. The
  critical finding is transitive `shell-quote`. No `audit fix`, force install, or
  broad upgrades were applied. Evaluate a focused remediation separately.
- Expo recommends RN 0.83.10, but the required baseline remains 0.83.2.
- Native compilation emits SDK XML compatibility, Kotlin/Java deprecation, and
  manifest replacement warnings. Preserve logs; do not upgrade the stack merely to
  silence warnings.
- Release process logs include a JDWP-agent message for the non-debuggable app,
  ashmem pinning deprecation, SoLoader initialization, bridgeless lifecycle, and
  predictive-back warnings. The UI and worker still start; none was observed as a
  fatal Bare addon/linking failure.
- The release APK is approximately 334 MiB because the template packages multiple
  native ABIs/addons. No architecture pruning was applied in this baseline.
- The emulator emits snapshot/Qt/graphics warnings. No app behavior is inferred from
  these warnings alone.
- Some upstream agent notes are stale: they describe local tarball dependencies and
  a Metro plugin import that are absent from the actual pinned manifest/lockfile
  and Metro configuration. The lockfile contains registry packages; `npm ci` passed.
- No iOS build, peer replication, Autopass, application CRUD, or actual OTA deployment
  has been tested in Phase 1.

Lockfile SHA-256 before and after installation:
`d607452c88c653ae9af96f6eb224dc5cb0d4b6b47fde2a37c5243a227f456c4f`.
