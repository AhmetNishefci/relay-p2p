# Phase 7 — performance and reliability

Baseline: `ee26606038e4a480f978679e2a682ba2de096daa`, Android ARM64 API 36,
Node 22.23.3, unchanged native/dependency lockfile. Measurements below were executed
on October 28, 2026. AI-generated implementation and verification are disclosed in
[AI_USAGE.md](AI_USAGE.md).

## Measured problem and change

The previous refresh promise represented the entire background drain. A save could
finish in Autopass yet its UI caller remain busy while later replication updates
kept the drain alive. The new refresher separates background invalidations from
explicit callers. Each caller waits for a read **started after its request**, not
for global quiescence. A dirty bit preserves the last invalidation; at most one list
is active. Close rejects waiting callers and suppresses late callbacks.

Run `node scripts/benchmark-foundation.js`. The deterministic held-read diagnostic
sends 100 continuing invalidations. The baseline explicit promise was still pending
after read 100; the revised promise settled after read 2. Maximum active reads was
**1 in both versions**. This measures scheduling correctness, not network latency.
Baseline source copies and raw runs remain in ignored local evidence.
To repeat against the verified baseline without changing the worktree:

```sh
mkdir -p .assessment-local/phase7-baseline
git show ee266060:src/worker/client.js > .assessment-local/phase7-baseline/client.js
git show ee266060:shared/protocol.js > .assessment-local/phase7-baseline/protocol.js
node scripts/benchmark-foundation.js .assessment-local/phase7-baseline/client.js .assessment-local/phase7-baseline/protocol.js
node scripts/benchmark-foundation.js
```

The same script validates 200 synthetic entries (6,000-character bodies) and 1,000
acknowledgments, 50 timed samples after five warmups. On Node/V8:

| Fixture | JSON bytes | Before median / p95 | After median / p95 |
| ------- | ---------: | ------------------: | -----------------: |
| ASCII   |  1,416,610 |    0.694 / 1.123 ms |   0.698 / 1.264 ms |
| CJK     |  3,816,610 |    0.731 / 1.207 ms |   0.702 / 0.971 ms |

These small differences do not establish a parser speedup. They are not Hermes,
rendering, disk, network or maximum-size Android UI benchmarks. The fixture is
within the existing 1,500,000-character normalized snapshot budget.

## Android before/after measurements

Release APKs were alternately installed with `adb install -r` on the same AVD,
retaining its 33-entry notebook. Other AVDs were stopped during measurement. Ten
force-stop/`am start -W` launches were followed by visible notebook readiness; the
reported `TotalTime` measures Activity launch, **not worker/data readiness**. Each
run then reset `dumpsys gfxinfo`, performed twelve alternating 500 ms vertical
swipes, and collected `gfxinfo framestats` and `meminfo`.

| Matched repeat                      |     Baseline | Phase 7 core changes |
| ----------------------------------- | -----------: | -------------------: |
| Activity launch median (10 samples) |   1,231.5 ms |             1,207 ms |
| Launch range                        | 828–1,962 ms |         864–1,442 ms |
| Whole-process PSS after scrolling   |   161,781 KB |           159,912 KB |
| Janky frames / total                |    129 / 133 |            121 / 131 |
| Reported frame p95                  |       150 ms |               150 ms |

There is **no defensible startup or scrolling speedup claim**. An earlier after-run
was anomalously fast (135 ms launch median and 2/391 janky frames), so it was retained
and the A/B experiment repeated rather than presented as a win. Emulator host load,
frame scheduling and cache state confound these numbers; PSS is not a retained-JS-heap
measurement. The measured core APK preceded the small editor recovery-button fix;
final functional/build verification covers that fix separately.

Reproduce with one ARM64 API 36 AVD, matching release APKs and data, Metro stopped:
force-stop; `adb shell am start -W -n com.anonymous.hellopearreactnative/.MainActivity`; wait for
**Field notebook**; repeat ten times. Reset `adb shell dumpsys gfxinfo
com.anonymous.hellopearreactnative reset`, perform twelve `adb shell input swipe 700 1800 700 800
500` / reversed swipes, then collect `adb shell dumpsys gfxinfo com.anonymous.hellopearreactnative
framestats` and `adb shell dumpsys meminfo com.anonymous.hellopearreactnative`. Keep host workload
and screen content fixed and preserve raw output. UI automation itself adds delay.

## Payload safety and ambiguous writes

JSON is capped at **4,600,000 UTF-8 bytes**, in addition to the existing 2,000,000
UTF-16-code-unit envelope ceiling. The existing normalized snapshot budget remains
1,500,000 characters, 200 entries and 1,000 acknowledgments. Worst-case three-byte
UTF-8 code units plus the bounded envelope fit the byte ceiling; legitimate CJK
notebooks are not cut to an arbitrary smaller quota. A length-based fast path avoids
an additional UTF-8 scan for ordinary supported snapshots.

Both outbound serialization and inbound parsing validate budgets. Oversized/circular
requests never enter the pending queue or transport. Unencodable worker results
produce a correlated `RESPONSE_UNAVAILABLE` error. A completed write may precede
that error. Foreign oversized stored values are skipped/counted, never deleted.
FramedStream has already allocated received frame bytes before JSON validation;
this is not a native framing sandbox or a bound on total replication storage.

Timeout, disconnect and unexpected post-dispatch failures preserve **unknown
outcome**. No automatic write retry occurs. Further entry mutations in the current
application session are blocked until a successful status query plus fresh snapshot. The editor footer offers **Review
notebook**, retains the draft, and opens the refreshed list for manual reconciliation.
The guard is not a durable operation journal. This does not create exactly-once
mutation semantics or prove the timed-out write failed: a delayed write can still finish after that snapshot. Manual retry may
therefore duplicate an add. Known pre-write validation/capability denials remain
ordinary errors.

## Verification scope

Focused tests cover continuing invalidations, the final dirty notification, one
active read, closure during a read, refresh failures, duplicate/late responses,
request timeout without replay, subscription removal, exact byte/character limits,
unencodable payloads, and foreign values. Controlled pairing barriers test cancellation
before acceptance, after acceptance but before readiness, and shutdown at that boundary.
Those barriers are deterministic fakes, not claims about network cancellation.
Real isolated Autopass/DHT tests additionally perform concurrent Contributor writes
and removals and require Contributor/Viewer convergence.

Android debug instrumentation is temporary inspector code outside Git. It verifies
that an oversized request writes zero mutation frames, a genuinely completed but
response-hidden save enters unknown state, review finds exactly one entry and keeps
the draft, and twenty sharing/back cycles retain one worklet, one application
subscriber and zero settled pending requests. Controlled worklet termination rejects
a pending request and presents recovery without spawning a replacement. A full app
restart retains data. This is not a SIGSEGV/native-crash recovery test.

The real Android stress run used the existing independent A/B/C peers. B wrote 100
entries while A saved through the real UI. A temporarily delayed list **responses**
by 400 ms in debug instrumentation; this was not an injected network delay. The
save detail screen appeared while B had completed only 26/100 writes. Its observed
8,606 ms includes UI automation and is not a release latency benchmark. During that
window A observed 28 change notifications and completed 20 reads, maximum active 1.
All 100 entries and B's acknowledgment reached A/C; C's worker rejected acknowledgment
with `READ_ONLY`. Concurrent removal batches then restored every original visible
entry and acknowledgment on all three peers. Only recorded synthetic IDs were removed.

Some verification attempts failed at the harness layer: Hermes inspector evaluation
does not compile `async` functions, competing inspector sessions can disconnect,
and a heading selector also matched a home button. Promise-chain probes, one
inspector connection per peer, and distinct screen headings corrected the harness.
Those failed attempts are retained, not counted as passing product tests.

## Final verification

| Check                                             | Executed result                                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm test`                                        | Formatting, lint and 44 application tests passed (27.995 s test run)                                |
| `npx tsc --noEmit`                                | Passed                                                                                              |
| `python3 -m unittest discover -s scripts/tests`   | 4 exporter/privacy tests passed                                                                     |
| `npm run bundle:bare`                             | Passed; regenerated before native builds                                                            |
| `./gradlew app:assembleDebug app:assembleRelease` | Passed in 26 s; 525 actionable tasks                                                                |
| Debug three-peer UI regression                    | Add, reverse replication, acknowledgment, Viewer actions, removal cancel/confirm and restart passed |
| Standalone release three-peer UI regression       | Same critical flow passed after cold launch, Metro stopped and reverse forwarding removed           |

Standalone offline/reconnect verification also passed: B had Wi-Fi disabled and no
active default network, recorded its acknowledgment locally while A/C remained at
zero, then A/C observed it after connectivity returned. A/B cold restarts retained
it. B resumed after backgrounding and received a new A entry; Viewer C received it
too. Network settings were restored. The ordinary handoff and new editor recovery
footer were inspected in actual Android screenshots; screenshots stay outside Git.

A fresh, isolated API 36 release peer additionally passed invalid-invitation recovery,
cancellation with both inviting Contributors stopped, a subsequent Viewer join,
replication of the existing entry/acknowledgment, and restart after invitation
cancellation. Its actual role remained Viewer; canceling the invitation did not
revoke its existing access. Original Viewer C was stopped temporarily rather than
reset; its existing data was preserved. The QA AVD and all capabilities/screenshots
remain under ignored local evidence. No invite strings were printed.

Final current-process logs on all original A/B/C peers show `[relay] Autopass ready`
and no fatal/native-binding matches. All are standalone release with Metro and
reverse forwarding absent; roles are Contributor/Contributor/Viewer. Original C
was restored and displayed the retained handoff. After evidence capture, only the
four IDs generated by the UI regressions were removed; all three peers returned to
the original **33 visible entries**. Orphan acknowledgments follow the existing
retention policy; this is not a claim of byte-for-byte storage rollback.

The APKs were built from the final application changes; subsequent changes are
benchmark reporting, privacy filtering and documentation. Dependency manifests,
lockfile, native configuration and branding are unchanged from the verified baseline.
The Gradle build uses existing local caches; Phase 6 separately records the clean
checkout build. No new clean-checkout claim is made here.

Warnings: Node's mock timer API is experimental; Gradle reports existing deprecated
features. An initial Metro missing-file failure was traced to Watchman's dropped
watch state despite the installed file existing. Resetting **only this repository's**
watch and clearing its Metro cache fixed resolution; no package upgrade or polyfill
was used. UIAutomator intermittently returned a null root around restarts; bounded
harness retries recovered. AVD tooling reports missing system-image `devices.xml`;
actual emulator boot/build behavior is reported separately, not inferred from that warning.

## Architecture and deferred work

See [native execution boundaries](../agent_docs/architecture.md#native-execution-and-profiling-boundaries)
for verified New Architecture/Fabric, SDK-provided TurboModule/JSI, copied IPC bytes,
Bare isolation, native packaging, and debug/release behavior. Relay implements no
custom native module or JSI extension. Native crashes can kill the shared process.

Home already uses `FlatList`. Each visible card currently filters acknowledgments,
and `renderItem`/press callbacks are recreated. These are possible profile targets,
but the measurements do not isolate them as the bottleneck.
No speculative memoization, index cache, dependency change or list rewrite was added.
Pagination, sustained physical-device profiling, background delivery, native crash
injection, iOS implementation and OTA deployment remain outside this phase.
