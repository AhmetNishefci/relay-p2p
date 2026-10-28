# Phase 5: Relay product interface

## Product and architecture

Relay has a welcome/join flow, notebook list, focused editor, entry detail/handoff,
and sharing/participant screen. Route state is local to React Native; no navigation
framework or new dependency was added. The warm paper/charcoal palette uses muted
teal for actions and restrained amber for errors. Native serif headings contrast
with native sans-serif body text. Spacing follows 4/8 dp increments; buttons have
50 dp minimum height and cards use 18–20 dp radii.

`src/useNotebook.ts` owns the existing worker subscription, entry/acknowledgment
snapshot, coalesced refresh, mutation state and original Pear control handlers. It
stays mounted above the keyed screen presentation subtree. Navigation resets scroll
and pressed state without starting another worker. A synchronous ref guard prevents
same-tick duplicate UI mutations; worker validation, idempotence and permissions
remain authoritative. `src/ui.tsx` holds shared tokens, buttons, headers and notices.
Sharing retains its own bounded participant refresher while mounted.

No worker, shared protocol, schema, dependency, native addon or storage layout
changed. The original updater application/reload timing is retained; no OTA update
was published or applied during this phase.

## Interactions and state meaning

- Welcome offers Create Notebook and Join Notebook; actual fresh storage is used.
- Home presents compact entry previews, actual local capability, entry count and a
  persistent New Entry action for Contributors. Pull-to-refresh retains entries;
  update events refresh automatically without clearing the list.
- Editor requires a nonblank title, retains drafts on errors, limits title/body to
  the existing schema bounds, and confirms discarding a draft. Saving reports local
  completion and opens the stored entry. Keyboard avoidance keeps Save reachable.
- Detail renders full selectable content and the handoff panel. Successful local
  action, observed records and records matching this device key remain distinct.
  Viewers see an explanation rather than mutation controls. Removal requires native
  confirmation and explains that retained copies/acknowledgments are not erased.
- Sharing describes Contributor versus Viewer access. Generated invitation text stays out of Relay’s sharing screen;
  the native share sheet supports Copy text or transfer through another app.
  Native Android handles clipboard confirmation; Relay does not invent a copy event
  or claim the recipient joined. Leaving the screen does not cancel an invitation.
  Cancellation does not revoke existing access or prove other peers saw the change.
- Joining has actual progress/cancellation UI and recoverable invitation errors.
  There is no inferred online, delivered, read or globally synced badge. Local writes
  remain possible offline; peer exchange needs connectivity and foreground apps.

Names/device keys are not verified identities. Acknowledgments remain mutable shared
claims with the limits described in [Phase 4](PHASE4.md). The two principal decisions
remain Sync state and Pairing/trust; see [README DECISIONS](../README.md#decisions).

## Visual and accessibility QA

Screenshots/XML/logs are local under gitignored `.assessment-local/phase5/`, not
committed. Actual Android screenshots were inspected for welcome, empty/populated
notebook, editor, detail/handoff, sharing, joining, errors and Viewer access.

The initial 130% font screenshot showed the role badge extending off the right edge.
Metadata rows now wrap; the corrected screenshot keeps it in bounds. Screen
presentation is keyed to avoid retaining the preceding screen's scroll position.
Android uses the existing status-bar height and bottom gesture clearance; the iOS
safe-area wrapper remains unverified. Removing the deprecated wrapper on Android
also removes its development warning source. No warnings were suppressed. Final screenshot review also consolidated duplicate
invitation-ready feedback and replaced misleading “device profile” wording with
“another device,” matching the pinned runtime’s observed profile limitation.

Static palette contrast calculations: body/paper **12.98:1**, muted/paper **5.00:1**,
white/primary **7.67:1**, teal/pale **6.43:1**, muted/pale **4.56:1**,
error/amber **6.10:1**. Disabled controls
have explicit accessibility state; role selection is exposed as radio/checked state.
Buttons/cards have labels and roles, headings are marked, status/error notices use
live regions, and text scales/wraps. Handoff actions include the entry title in their
accessible label. The short notice fade checks the system reduced-motion preference;
there is no essential motion or animation library.

TalkBack spoken output, switch access, physical devices, iOS, unusual display cutouts,
three-button navigation and font scales beyond the checked range are not claimed as
tested. Android safe-area spacing is verified on the API 36 gesture-navigation AVDs,
not a general solution for every window configuration. Native launcher/splash assets
and package/runtime identity remain from the pinned template.

## Verification

| Check                      | Actual evidence                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality                    | TypeScript, formatting, lint and 25/25 tests passed; `typescript.log`, `quality-final.log`                                                                                                                      |
| Worker bundle              | Passed; `bundle-final.log`; no worker/dependency source change                                                                                                                                                  |
| Android debug              | Native build and UI-driven CRUD/handoff, Viewer controls, removal confirmation, persistence passed; `debug-build.log`, `debug-ui-results.json`, original/resumed logs                                           |
| Actual Bare checks         | Explicit acknowledgment permission/spoof/duplicate/persistence/deletion checks passed through RN client IPC; `debug-worker-results.json`                                                                        |
| Fresh Create/Join          | Real owner-user AVD Create and empty notebook, invalid invitation recovery, cancellation, Contributor join and invitation cancellation passed; `fresh-ui.log`, `join-ui-results.json`                           |
| Long content               | Stored 120-character title and 8,000-character body render and scroll to handoff; `long-content.log`, top/bottom screenshots; only this fixture was removed afterward                                           |
| Reduced motion             | Actual Android `AccessibilityInfo.isReduceMotionEnabled()` returned true with the system preference enabled; preference restored; `reduced-motion.json`                                                         |
| Release build              | Passed in 8 seconds; `release-final-build.log`; installed on all three retained peers                                                                                                                           |
| Standalone release         | Metro stopped and 8081 forwarding removed; UI-driven bidirectional CRUD, handoff, Viewer restrictions, removal confirmation and A/B restart passed; `release-ui-results.json`                                   |
| Offline/background         | Confirmed no active network on B, local acknowledgment while A/C remain zero, observation after reconnect, restart persistence and Home/resume passed; `release-offline-background.json`                        |
| Native invitation transfer | Viewer invite generation, native Copy text action, cancellation and Viewer sharing restrictions passed on final release; `final-sharing.json`                                                                   |
| Fresh standalone           | Clean welcome, invalid invitation, real joining/cancel, Create and empty notebook passed; `fresh-release.json`, original/resumed logs                                                                           |
| Draft/rapid taps           | Keep/discard preserves or discards only the unsaved draft; rapid Save taps produce one entry; actual launcher background and resumed replication observed; first two passed steps in `release-interactions.log` |

Commands executed with Node 22.23.3:

```sh
npx tsc --noEmit
npm test
npm run bundle:bare
npm run android -- --device Tether_API_36_ARM64
npm run production:android -- --no-bundler --device Tether_API_36_ARM64
```

The verified generated APK is retained locally as
`relay-product-verified-release.apk`, with its SHA-256 in `release-apk.sha256`.
It and all screenshots/transcript snapshots are excluded from Git.

The existing three original peer stores were retained. Additional fresh AVDs were
used for onboarding and Create/Join checks; no existing notebook was reset or
replaced. UI automation uses actual fields/buttons and native hierarchies. Debug
inspector checks use the existing RN client and real Bare IPC, not direct storage
writes or imported replication data.

## Environment and failed checks

The initial full automated run passed 24/25: an isolated DHT reconnect acknowledgment
was not observed within its existing test deadline while fresh AVDs were being
prepared. The unchanged assertions/timeouts then passed 25/25; both runs are retained.
No failure was bypassed or product/networking change made to satisfy that retry.

Secondary Android test profiles exposed a runtime limitation: the pinned Bare path
resolved `/data/user/0/...` under user 10 and failed to initialize there. No runtime
patch was introduced. Fresh owner-user AVDs were used instead, and original peer
stores were retained. The extra test profiles are stopped. The original Viewer AVD
needed a cold boot after an ADB-offline startup. A later port handoff booted the VM
without its expected ADB/console bindings; fully terminating that VM before starting
it again restored ports 5558/5559 and ADB registration. No userdata reset was performed.

Initial UI-driver attempts include lock-screen/startup timing, a failed native input
replacement that left an extra character (correctly rejected as an invalid invite), a missing editor
selector, transient accessibility dumps and an input-method query returning exit 255.
The missing-selector cause was not conclusively isolated. One supplementary inspector
run queried restarted peers before readiness; another stalled in an unbounded
inspector transport. The local harness now waits for actual UI readiness and bounds
its transport waits. The final supplementary run passed. Read-only dump/query retries
are bounded; completed writes are not automatically replayed. Original failures and
resumed evidence are retained separately, not relabeled as successful complete runs.

See [AI disclosure](AI_USAGE.md) for authentic session snapshots and generated-code
attribution. This report is evidence documentation, not an original AI transcript.

Native long-press Copy could not be activated on the revealed Text in this build.
The native share sheet exposed a reliable Copy text action, so the final interface
uses Share or copy invitation and removes the unreliable reveal/selection route.
The native Copy action was invoked without logging capability material. Its transient
clipboard-confirmation text was not captured; Relay does not claim a separate copy
receipt. Failed selection evidence is retained in `release-interactions.log`.
