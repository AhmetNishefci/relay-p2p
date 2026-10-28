# Phase 8 — Notebook Activity

Baseline: `19ac23a23e9474ff30f58d2f565034c25e7b5a22`. Activity is a read-only
projection of the existing current entry/acknowledgment snapshot. It adds no
Autopass record kind, worker operation, networking subscription, dependency, or
native configuration. [AI authorship disclosure](AI_USAGE.md) remains applicable.

## Product behavior

Open **Notebook activity** from the notebook. Three filters show:

- **All:** current entry records and their associated acknowledgment records.
- **Acknowledgments:** current records claiming an acknowledgment for a device key.
- **No acknowledgment:** entries for which this device currently has no associated
  acknowledgment record. This does not mean no other peer has acknowledged offline.

Tap a row to open its entry. Header or Android Back returns to the selected filter;
removing an entry from that detail also returns to Activity. If another Contributor
removes an open entry, the existing missing-entry screen provides **Back to activity**.
The filter is retained within the app session. A new process starts on the notebook
and defaults to All; stored records reconstruct the view.

The page explicitly labels device-recorded times and explains that they are not
verified delivery/read events. Keys are unverified record claims; another
Contributor can alter shared keys. Entry records contain no author identity, so
none is invented. Activity is not a permanent audit history: deleted entries and
associated orphan acknowledgments disappear; overwritten records replace their
previous representations. Underlying retention/deletion semantics are unchanged.

All roles can browse. Activity itself has no mutation actions; entry details retain
existing Contributor/Viewer capability checks. Stored records remain available
without a network connection. New peer records appear after actual replication;
there is no inferred online/offline or globally synchronized indicator.

Loading is distinct from an empty notebook. Pull-to-refresh uses the existing local
snapshot refresh, with a spinner. Errors remain visible with **Check again**, while
previously loaded records remain displayed. Unsupported-record warnings are also
retained. Empty states distinguish a new notebook, missing acknowledgment records,
and every current entry having a locally visible record.

## Implementation

`src/activity.js` maps the validated snapshot into scalar presentation rows. Keys
are `entry:<id>` and `ack:<entry-id>:<writer-key>`. Duplicate identities are collapsed
within the snapshot; updates replace the projection rather than appending events.
An entry lookup and acknowledged-entry set associate records without filtering the
whole acknowledgment array for each row. Input arrays/records are not mutated.

Rows sort by recorded timestamp, with stable ID ties. That is display ordering,
never distributed causality or conflict resolution. Unrepresentable JavaScript dates
show **Device time unavailable** instead of throwing during rendering.

`NotebookActivity.tsx` memoizes the projection, uses `FlatList` with stable keys and
render callback, and memoizes rows whose props are scalar. A stable App callback
opens an entry by ID. Variable row heights accommodate wrapping and font scaling;
no fixed-height layout assumptions or new animation/navigation library were added.
This is an implementation description, not a measured frame-rate improvement claim.

One App controller/worklet/IPC session remains above the keyed screen subtree.
Filter state lives in App so a detail round trip preserves it. Activity creates no
worker listeners and sends no per-row requests. The existing Phase 7 refresh and
unknown-mutation-outcome behavior are unchanged.

## Observed Android inset defect

The first standalone peer run stopped before creating test data because B's Back
button overlapped the status bar. A screenshot and Android window dump showed
Back starting at 21 px while the status/cutout inset extended to 136 px.

Installed RN 0.83.2 caches `StatusBar.currentHeight` when its module loads. Native
`DisplayMetricsHolder.getStatusBarHeightPx()` returns zero when window insets are
not yet available; the old nullish fallback accepted zero. Relay now refreshes the
height after root layout through RN's existing `StatusBarManager` TurboModule,
using a positive initial fallback until real metrics are available. This introduces
no custom native module, native patch, or dependency. Five cold release launches across A/B/C placed Back at 157 px, below the
actual 136 px status/cutout boundary; unusual devices/cutouts remain unverified.

## Verification

Seven focused tests cover association/filtering, repeated notifications and restart
reconstruction, hidden orphans after removal, current-record overwrite behavior,
clock skew/ties/date bounds, non-mutating projection, and the supported 200-entry /
1,000-acknowledgment snapshot. Empty-state guidance is checked separately from the
all-entries-have-records case.

Executed checks:

| Check                              | Result                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                         | Formatting/lint and all 51 application tests passed; 0 failures/skips                                                                                          |
| `npx tsc --noEmit`                 | Passed                                                                                                                                                         |
| Python transcript-export tests     | 4 passed                                                                                                                                                       |
| Bare bundle                        | Passed; worker source unchanged                                                                                                                                |
| Final debug + release Gradle build | Passed in 10 s; 525 actionable tasks                                                                                                                           |
| Debug Activity UI                  | All/ack filters, delayed refresh spinner, visible refresh error, retained records and Check again recovery observed                                            |
| Cold-start inset fix               | Five release launches: Back top 157 px, native status/cutout bottom 136 px                                                                                     |
| Three-peer release flow            | Matching initial counts (49 All / 16 acknowledgments / 17 without), offline B acknowledgment, automatic A/C update, all-peer restart and remote removal passed |
| Navigation/resume                  | Detail/filter return, original notebook-detail return and Activity background/resume passed                                                                    |
| Isolated empty states              | Empty notebook, missing acknowledgments and all-current-entries-have-records states observed                                                                   |
| Normal + 130% fonts                | Final filters at least 48 dp wide AND tall; wrapping, ellipsized row titles and full-title detail navigation observed                                          |

Initial visual QA found the All tab was only 41.5 dp wide despite its 48 dp height.
It now has a minimum width; both dimensions were rechecked on the final APK at
100% and 130% fonts. The initial harness checked height only; those early results
are not presented as width verification. Font settings were restored, and the
isolated QA notebook is separate from the original shared stores.

The first peer run's Back-selector failure exposed the inset defect above; it was
not counted as a successful run. Corrected runs and raw failures are retained. The
refresh failure/delay controls were temporary debug-inspector overrides, not real
storage corruption or production test hooks. Actual screenshots were inspected for
normal/large fonts, populated and empty views, handoff state and error recovery.
The complete three-peer flow was repeated against the final APK after the minimum
width correction. Both runs passed. Only the generated test entry was removed;
original A/B/C returned to 33 entries and 49 current Activity records (16
acknowledgments, 17 entries without records). Viewer C was restored after isolated
QA. Final current-process logs on all three peers show Autopass startup and no
fatal/native-binding error matches; Metro and reverse forwarding are absent.
No existing notebook was reset or replaced.

Feature source was frozen at 17:26:56 Kosovo time, ahead of the 19:30 implementation
cutoff. The unconditional 20:30 submission freeze and final 90-minute reserve remain
in force. No remote, publication or reviewer invitation was performed. Development
attribution and policy context are documented in [AI assistance disclosure](AI_USAGE.md).

Screenshots, emulator data and automation evidence remain under ignored
`.assessment-local/phase8/`, outside Git. No physical Android device or iOS test is
claimed. TalkBack spoken output has not been verified.
