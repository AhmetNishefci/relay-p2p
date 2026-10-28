# Phase 2: persistent Autopass and IPC foundation

This milestone implements one local notebook and a deliberately plain development
interface. Pairing, invites, acknowledgments, multiple notebooks, and final Relay
design are not implemented. See [Phase 1](PHASE1.md) for native setup and baseline
provenance; [AI usage](AI_USAGE.md) identifies generated code and review obligations.

## Dependency review

Autopass is pinned to published version **3.4.1**. Installation added 18 packages
and changed **zero existing package versions** relative to the Phase 1 lockfile.
Its resolved Autobase is 7.28.2 and its direct HyperDB is 4.22.3. Another dependency
has a nested HyperDB 6.11.0; those are separate resolutions, not a native upgrade.

The copied worker's direct dependencies are pinned to the existing resolutions:

| Dependency                             | Version |
| -------------------------------------- | ------- |
| corestore                              | 7.12.0  |
| hyperswarm                             | 4.17.0  |
| graceful-goodbye                       | 1.3.3   |
| framed-stream                          | 1.0.1   |
| bare-path                              | 3.1.1   |
| bare-storage                           | 1.1.0   |
| which-runtime                          | 1.4.0   |
| hypercore-crypto (entry ID generation) | 3.7.0   |

Native addon resolutions remain unchanged: rocksdb-native 3.17.4, sodium-native
5.1.0, udx-native 1.21.1, quickbit-native 2.4.8, rabin-native 2.0.0, and
simdle-native 1.3.9. React Native 0.83.2, Expo 55.0.29, Bare Kit 0.12.3,
and pear-mobile 4.3.0 are unchanged. npm still reports the same 27 audit findings;
no broad updates or forced fixes were applied.

## Ownership and lifecycle

`workers/main.js` is copied from the exact installed hello-pear-worker 1.1.0,
with its runtime require changed to `pear-mobile`. It preserves the positional
startup arguments, updater Corestore/swarm initialization, original control frames,
and updater shutdown resources. Apply errors now produce the existing sanitized
failure frame rather than escaping an async handler; success/reload timing is
unchanged. No actual OTA update was staged or applied.

`workers/notebook.js` owns a separate Corestore at:

```text
path.join(pear.storage, 'relay', 'notebook')
Android: /data/user/0/com.anonymous.hellopearreactnative/files/app-storage/relay/notebook
```

It awaits Autopass `ready()` and then reports ready/writable. Status can be queried
while starting; data operations receive `NOT_READY` until initialization completes.
Storage errors are logged internally and reported with sanitized errors. No startup,
error, or restart path deletes data. Operations are serialized, with a maximum of
32 queued requests. List snapshots use `for await` over `pass.list()`.

`src/worker/runtime.ts` holds one session on `globalThis`, preventing another worker
on screen remount/Fast Refresh. `PearRuntime.run()` returns only IPC, so a disconnected
session requires a full app restart instead of guessing that its store owner died.
Screen cleanup removes listeners and stops its refresher, without destroying the
shared pipe. Graceful goodbye/pipe close attempt idempotent notebook, store, and
updater cleanup. OS force-stop may bypass JavaScript cleanup; persistence is tested
through actual force-stop/relaunch.

Autopass, Corestore, replication, and cryptographic ID generation remain in Bare.
React Native handles forms, local feedback, control-message UI, and display data.

## Record schema

The worker generates a cryptographically random 16-byte ID encoded as 32 hex digits.
The Autopass key is `entry:<id>` and value is a JSON string:

```json
{
  "schemaVersion": 1,
  "kind": "entry",
  "id": "0123456789abcdef0123456789abcdef",
  "title": "North gate",
  "body": "Gate inspected.",
  "createdAt": 1793174400000
}
```

Titles are trimmed, nonempty, and limited to 120 characters; body length is at most
8000 characters. Timestamps are presentation metadata, not authoritative distributed
ordering. The list sorts by timestamp and ID for local display only.

Future fields on known records are tolerated but stripped from IPC results. Unknown
record prefixes are left untouched; malformed/unsupported entry records are skipped
and counted visibly. No attachment buffers or internal handles cross IPC.
The current snapshot limit is 200 entries and 1.5 million serialized record
characters. Exceeding a limit returns `LIST_LIMIT`; it does not silently truncate
or delete records. Pagination is future work.

## Application protocol

The original Pear strings and application JSON share the existing single
FramedStream. `shared/protocol.js` implements runtime validation and
`shared/protocol.d.ts` defines the operation/result mapping used by TypeScript.
No new RPC or validation package was installed.

Requests:

```json
{"v":1,"type":"request","id":"1","op":"status","payload":{}}
{"v":1,"type":"request","id":"2","op":"entries.add","payload":{"title":"North gate","body":"Gate inspected."}}
{"v":1,"type":"request","id":"3","op":"entries.list","payload":{}}
{"v":1,"type":"request","id":"4","op":"entries.remove","payload":{"id":"0123456789abcdef0123456789abcdef"}}
```

Successful response results are respectively:

- `{ state: 'starting' | 'ready' | 'failed' | 'closed', writable: boolean }`
- The newly stored entry.
- `{ entries: Entry[], skipped: number }`
- `{ id: string, removed: true }` (idempotent removal).

For example:

```json
{"v":1,"type":"response","id":"1","ok":true,"result":{"state":"ready","writable":true}}
{"v":1,"type":"response","id":"2","ok":false,"error":{"code":"INVALID_PAYLOAD","message":"Invalid operation payload."}}
{"v":1,"type":"event","event":"ready","payload":{"state":"ready","writable":true}}
{"v":1,"type":"event","event":"changed","payload":null}
{"v":1,"type":"event","event":"error","payload":{"code":"INIT_FAILED","message":"Notebook could not start. Restart the app; stored data is retained."}}
```

An invalid request without a usable ID receives an error response with `id: null`.
Errors include invalid messages/version/payload, unknown operation, not ready,
read-only, busy, initialization/storage failure, and list limits. Unexpected native
errors are logged internally; their raw messages/paths/stacks are not sent over IPC.

The client correlates IDs and validates each result for the requested operation.
Late/duplicate replies cannot resolve a different request. Requests time out after
10 seconds; startup also has a visible 30-second bound. A timeout means the outcome
is unknown, not that a write was rolled back. There are no automatic write retries;
refresh/reconcile before retrying. Background execution can suspend timers and
networking; this milestone does not promise precise background deadlines.

## Updates and user feedback

Exactly one notebook subscription forwards Autopass `update` as `changed`. React
requests a fresh list. The refresher permits one in-flight list and one dirty bit;
updates during that list cause one follow-up read, avoiding overlapping stale
responses. Component disposal prevents outstanding lists updating an unmounted UI.
Mutations also request a refresh after completion to cover missed event timing.

The development interface shows worker status, entry count, update count, editable
title/body, add/remove/refresh actions, and errors. Successful writes say **Saved on
this device**. Neither update events, writable status, nor local completion claims
remote delivery or acknowledgment. Removal changes the notebook view and does not
promise erasure of retained copies.

## Verification

```sh
nvm use
npm ci
npm run check:upgrade
npm run bundle:bare
npx tsc --noEmit
npm test
npm run android
npm run production:android -- --no-bundler
```

`npm test` now runs formatting, lint, and `npm run test:foundation`; the latter uses
Node's built-in test runner with the real installed Autopass/Corestore and no new
test dependencies. Integration fixtures use temporary stores with replication
disabled to isolate local behavior; they do not prove peer networking.

Runtime evidence and exact commands are retained in `.assessment-local/phase2/`.
The ADB UI harness interacts with the actual fields/buttons and records hierarchy,
screenshots, IDs, and pass/fail evidence. It does not inject entries directly into
storage or call an alternate implementation.

Executed October 28, 2026:

| Check                                     | Result                                                                    | Local evidence                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Published API and installed source review | Autopass 3.4.1 API confirmed; `get()` returns `{ value, file }`/null      | Transcript, `node_modules/autopass/index.js`                                |
| Lockfile comparison                       | 18 added packages; zero existing version changes                          | `dependency-diff.json`, `npm-install.log`                                   |
| TypeScript                                | `npx tsc --noEmit` passed                                                 | `tsc.log`, transcript                                                       |
| Formatting/lint/tests                     | `npm test` passed; 15 Node tests, zero failures                           | `final-checks.log`                                                          |
| Fresh worker bundle                       | Passed after final worker edits                                           | `bundle-bare.log`                                                           |
| Debug native build                        | Passed; installed and opened                                              | `android-debug-build.log`                                                   |
| Debug readiness/CRUD/error/update         | Actual UI flow passed                                                     | `debug-functional.json`, hierarchy/screenshots                              |
| Debug restart                             | Same entry ID/body remained after force-stop/relaunch                     | `debug-functional.json`                                                     |
| Release native build                      | Passed in 9 seconds; installed and opened                                 | `android-release-build.log`                                                 |
| Release readiness/CRUD/error/update       | Actual UI flow passed without a Metro listener                            | `release-functional.json`                                                   |
| Release restart                           | Same IDs and values retained, including the debug-created entry           | `release-functional.json`                                                   |
| Additional standalone cold launch         | No Metro listener or 8081 reverse; Autopass ready and saved entry visible | `release-standalone.json`, `release-final-runtime.log`, `release-final.png` |
| Native error inspection                   | No fatal Bare addon error observed in captured process logs               | `debug-final-runtime.log`, `release-final-runtime.log`                      |

After final startup-error sanitization, a fresh worker bundle was built and the
release APK rebuilt successfully in 8 seconds (`android-release-final-build.log`).
The bundle timestamp precedes the embedded RN bundle and APK timestamps, confirming
that the final APK uses the fresh worker. The final APK repeats the real UI flow
with results in `release-final-functional.json`.

The release CLI recreated ADB reverse forwarding even with `--no-bundler`.
There was no Metro listener during release functional execution. Forwarding was
then explicitly removed before the additional standalone cold launch.
The `bare` tag was checked; actual worker output on this emulator uses the
`pearreactnative` tag, so PID-scoped logs were also collected.
Warnings remain from SDK XML compatibility, deprecated Gradle/native APIs,
non-debuggable JDWP initialization, and emulator graphics/ashmem. Successful
rendering and worker logs were verified separately from build success.

The 15 tests cover supported/invalid protocol payloads and versions, unknown
operations, malformed JSON/oversized messages, sanitized error mapping, out-of-order
correlation, late responses, timeout/write/disconnection failure, refresh coalescing
and recovery, real Autopass CRUD/update callbacks, duplicate removal, concurrent
adds with distinct IDs, unknown/corrupt records and DTO normalization, readiness,
read-only mutation rejection, and persistent values/writer keys across store reopen.
They do not test viewer pairing, peer delivery, actual worker crashes, or OS power
loss. No peer result is inferred from local integration tests.

## Remaining scope and review

No second peer, invites, authenticated identity, delivery receipts, conflict history,
or acknowledgment handoff has been implemented or tested. Local writable checks are
covered with an injected read-only property in a Node test, not an actual viewer peer.

Before submission the candidate must personally review and meaningfully modify the
core behavior, especially request timeouts/reconciliation, validation/forward
compatibility, runtime lifetime, and the selected storage/serialization limits.
All foundation implementation introduced in this phase was generated by Codex under
the candidate's authorization; no candidate-authored implementation is claimed.
