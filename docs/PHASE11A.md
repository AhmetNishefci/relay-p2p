# Phase 11A — attachment architecture feasibility

Baseline: `0b2c60927fa0fa0f1d915d9880199178f0882d12`, clean `main` at start.
This phase changes the notebook scan and adds isolated diagnostics. It does not
implement product attachments, picker UI, new schemas or product IPC operations.
No dependencies or native configuration changed; no remote push is authorized.
[Development attribution](AI_USAGE.md) applies to all generated changes.

## Record-range adapter

Autopass **3.4.1** `list(opts)` ignores options and returns all decoded records,
including inline `file` buffers. `add(key, value, file)` stores files inline in
replicated operations; `get(key)` returns `{ value, file }`. Upstream's 6 MiB guard
is not Relay's proposed 1 MiB product limit.

`workers/record-snapshot.js` uses `pass.base.view.snapshot()` and two HyperDB key
ranges: `[ack:, ack;)` and `[entry:, entry;)`. Both ranges share the same snapshot,
including when writes arrive between reads. The snapshot closes on success, early
termination and decode failure. Existing validation, skipped-record counts, quotas,
ordering, hidden orphan acknowledgments and updates remain in `Notebook.perform`.

This is a narrow **internal API dependency**, verified against installed HyperDB
**4.22.3**. Tests assert those versions and actual binary-decode behavior. There is
no fallback to unrestricted listing. Revalidate before changing either dependency.
It is not a general metadata projection: files under `attachment:` are excluded,
but a file improperly embedded under `entry:` or `ack:` will still be decoded.
Replication/apply and initial storage writes also necessarily process file bytes.
It does not impose a binary quota on another Contributor's raw writes.

## Measured refresh scan

Executed on Node **22.23.3**, warm local Corestore, 100 small entries and sixteen
1 MiB attachment records. Ten scans per method, one preceding warm-up excluded.
The benchmark instruments record reconstruction to count decoded file bytes.

| Scan                       | Median   | Range          | File bytes decoded per scan |
| -------------------------- | -------- | -------------- | --------------------------- |
| Previous unrestricted scan | 0.718 ms | 0.392–0.783 ms | 16,777,216                  |
| Shared-snapshot key ranges | 0.381 ms | 0.247–0.550 ms | 0                           |
| Normalized `entries.list`  | 0.364 ms | 0.252–0.739 ms | 0                           |

These are storage scan/snapshot diagnostics, not complete UI refresh timings, Android latency,
peak memory, disk-I/O totals or guarantees. Decoded buffers can be views over storage
buffers; the count is not a claim that every byte represents a new allocation.
Reproduce with `node scripts/benchmark-record-snapshot.js`. Fixtures use temporary
stores and are removed afterward.

## Android shared-file staging

The explicit probe entry is `scripts/probes/staging-rn.js`; it is never imported
by the application. It accesses the already packaged Expo FileSystem native module
and starts `scripts/probes/staging-worker.js` as an isolated Bare Kit worklet.
Neither probe opens Autopass or touches existing notebooks.

Observed private root on Android API 36 ARM64:

```text
/data/user/0/com.anonymous.hellopearreactnative/cache/relay-staging-probe
```

Bare creates random, per-transfer directories. Requests contain only a live opaque
handle and expected BLAKE2b-256 digest. Input/output names are fixed; callers cannot
supply paths. Size is checked before allocation/read and descriptor identity is
checked after open. Reads are bounded to the observed size plus one byte. Digest
mismatch, missing files, symlinks and changed length fail explicitly. Two live slots
are allowed, including concurrent reservations.

React Native generated deterministic bytes, wrote them through native FileSystem,
Bare verified their digest and wrote an exclusive output, then React Native read
and compared every output byte. Android passed 0 bytes, 37 bytes and **1,048,576
bytes**; **1,048,577 bytes** was rejected. Traversal and absolute-path handles were
rejected. Normal and oversized-file failure cleanup left no transfer directories.
ADB inspection showed mode **2700** (owner-only access plus inherited setgid), UID
10215/GID 20215 on the tested AVD. These IDs are evidence, not configuration.
The probe exchanges no attachment bytes or base64 through JSON IPC.

This is not a sandbox between runtimes: both share the application UID. Protection
against arbitrary code already running inside that app is not claimed. App death
can leave cache slots; expiry/startup cleanup, provider URI access, product error
mapping and integration with permissions/timeouts remain Phase 11B work.

### Reproduction

Use the README Node/JDK/Android environment and an existing debug emulator. No new
native package is needed. From the repository root:

```sh
mkdir -p .assessment-local/phase11a
npm run bundle:bare
npx bare-pack --host android-arm64 --linked --out .assessment-local/phase11a/staging.bundle.js scripts/probes/staging-worker.js
npm run android -- --device YOUR_AVD_NAME
# With Metro/debug app running, in another terminal:
node scripts/probes/run-staging.mjs
```

The host driver loads the explicit diagnostic entry through Metro's inspector and
waits for bounded results. Its Unicode escaping avoids an observed inspector parser
failure; the original failed run remains local evidence. Generated bundles, raw
logs, screenshots and fixtures remain ignored under `.assessment-local/phase11a/`.
The probe is not included in the product entry or invoked in standalone release.

## Verification

- Four focused staging/range tests passed, covering binary namespace exclusion,
  malformed records, ordering, writes during a snapshot, updates, deletion, early
  return/error cleanup, size boundaries, digest errors, missing files, symlinks,
  traversal and concurrent slot limits.
- The initial full run exposed three old snapshot test doubles that only implemented
  `pass.list()`. They now implement range snapshots; original payload/quota assertions
  remain. The subsequent complete run passed all **55 tests**.
- TypeScript, lint (no issues), formatting, all four exporter tests and Bare bundling
  passed. No dependency, lockfile, native configuration or product UI changed.
- Android debug build/launch and the real shared-file probe passed. Standalone release
  built successfully (Gradle reported 7 seconds, with existing deprecation warnings).
  Release was installed and cold-launched without Metro/reverse forwarding on A/B/C.
- The three independent release peers passed entry replication, Contributor
  acknowledgment replication, Viewer-specific controls, force-stop/restart persistence
  and deletion convergence. All original **33 entries** remained on every peer.
  Current-process logs showed Autopass startup with no observed fatal/addon matches.
  Viewer worker-enforcement tests are automated; this Android run checked its UI.
- The first release driver used the wrong deletion-confirmation label. Its temporary
  entry was removed and original counts verified before a corrected full run passed.
  A transient UiAutomation null-root error in that run recovered through the existing
  bounded retry. Raw failures and corrected results are retained separately; neither
  issue is represented as an application or replication defect.

No attachment bytes were replicated across Android peers in this phase: the staging
probe tests same-device interoperability, and the release regression tests existing
notebook behavior. Full peer attachment verification is Phase 11B scope.

## Remaining Phase 11B work

Allow one attachment per entry, maximum 1 MiB. Add compatible picker/export support,
validated metadata and binary-record association, failure/orphan retention semantics,
on-demand bounded retrieval, transfer lifecycle and polished editor/detail controls.
Verify byte equality on receiving Android peers, fresh joining, restart, reconnect,
Viewer access and product timeout behavior. Estimated **5–7 hours**, subject to native
provider issues. No attachment product functionality should be claimed before those
checks pass. Phase 11A is not authorization to implement or push Phase 11B.
