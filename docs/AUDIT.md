# Final engineering and submission audit

The live assessment was retrieved through GitHub's public Gist API on October 28,
2026 after the HTML reader failed. Source:
[original assessment](https://gist.github.com/chocky335/f4d214c26a64307a94f6ec46b9620c80).
The recruiter deadline remains October 28 at 22:00 Kosovo time; the Gist's generic
submission period is not treated as an extension.

**Submission recommendation: NO-GO while authorship compliance is unresolved.**
All application implementation remains disclosed as AI-generated. No qualifying
candidate contribution is evidenced. Working software and disclosure do not override
the assessment's explicit exclusion of fully AI-coded submissions.

## Requirements

| Requirement                         | Audit status and evidence                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Required template `4ad3f8d`         | Verified provenance in setup commit and Phase 1; license/notices retained                              |
| Worker-copy/runtime compatibility   | Copied worker, pear-mobile remap, pinned direct dependencies and separate Corestore verified in source |
| Add/remove/list/update UI           | Implemented and verified in Node and Android peer tests                                                |
| Novel P2P interaction               | Explicit separate acknowledgment records; real peers observe replicated handoffs, including reconnect  |
| Exactly two principal decisions     | README documents Sync state and Pairing/trust, alternatives, sacrifices and change conditions          |
| Styled React Native UI/feedback     | Verified actual screenshots, larger-font wrapping, original launcher and cold-launch splash            |
| Atomic conventional commits         | Coherent conventional history retained; two audit messages omit the requested scope; no rewriting      |
| Setup/reproducibility               | Verified isolated checkout install, CLI, metadata, bundle, tests and debug/release builds              |
| AI usage/transcripts                | Genuine known session exported with explicit privacy filtering; other-session completeness unconfirmed |
| Candidate authorship/live ownership | Unresolved; no qualifying candidate implementation or human review evidenced                           |
| Private GitHub/reviewer access      | Not created, pushed or invited; intentionally pending explicit authorization                           |
| Files/iOS                           | Attachments optional and not implemented; iOS not claimed as tested                                    |

## Demonstrated defects and scoped fixes

1. A coalesced refresh caller returned before the in-flight/dirty follow-up read
   completed. Callers now share drain completion; a regression also covers an update
   arriving at completion. This makes reconciliation reads awaitable without replaying
   a mutation.
2. A library closed during creation could later activate the new store and write its
   manifest. This was reproduced with a real isolated store. Shutdown now owns/waits
   for pending creation, rejects activation after close, and shares cleanup completion.
   Pair completion checks the same closed boundary. Partial data is retained.
3. The inherited CI selected floating `lts/*` instead of `.nvmrc`. CI now uses the
   pinned Node file and `npm ci`, type checks and tests with read-only permissions.
   The unrelated npm publishing workflow was removed. GitHub execution is unverified
   until an authorized private repository exists.
4. The live registry audit flagged a critical `shell-quote` advisory. A scoped update
   changes only that pure-JavaScript lockfile entry from 1.10.0 to compatible 1.12.0;
   React Native, Expo, Bare and native-addon versions remain unchanged.
5. Template launcher/splash branding is replaced with original Relay vector-derived
   assets through Expo config/prebuild. Display name changes; runtime identity does not.
6. The real reconnect test failed its 12-second lookup wait during a parallel native
   build, then passed idle. Its bounded wait is now 30 seconds (whole test 120 seconds);
   assertions are unchanged. The revised suite passed; no production timeout changed.
7. Reviewer transcripts were only available in ignored local storage. A checked-in,
   integrity-manifested redacted export and source exporter now provide reviewer access.
   Original records are not modified or falsely described as public/unredacted.
8. Invitation copy implied device ownership. An isolated real-peer probe confirmed
   Contributor B reused A's invitation and canceled it, with A observing removal.
   UI/README now explain shared invitation records and the limits of canceling the
   locally known invitation; concurrent/stale invitations may remain. No invitation
   owner model, global revocation guarantee or new operation was added.

## Security, trust and bounded guarantees

Autopass writer keys are not verified humans or per-record authenticated provenance.
Another Contributor can overwrite an acknowledgment key; the isolated test confirms
this. Viewer write protection is inside Bare. Invitations are bearer access material;
native sharing/copying is explicit, capability strings are not logged, and canceling
an invite does not revoke existing members or guarantee remote observation.

Acknowledgments bind to IDs, not content hashes. Entry removal hides retained orphan
acknowledgments and does not promise remote erasure. Snapshots are bounded and fail
visibly beyond their limits. No delivery/read/fully-synced state is invented.

An IPC timeout does not cancel its write. No mutation is automatically replayed.
A successful fresh snapshot is ordered after prior local operations; it does not
supply an exactly-once identity for an ambiguous add. Users must review and reconcile
before retrying. Power loss during manifest writes, arbitrary process termination,
hostile networks and external malicious writers are not claimed solved.

Registry findings are recorded locally in `npm-audit.json` / `npm-audit-after.json`.
No broad `audit fix --force`, Expo downgrade or native-addon upgrade is applied.
The scoped fix removed the critical finding: **26 remain: 13 high, 4 moderate,
9 low, 0 critical**. They include Expo/CLI tooling and XML/schema/image parsing
packages (`@xmldom/xmldom`, `joi`, `zod`, `image-size`, `launch-editor`, `node-forge`,
`body-parser`, `compression`, `js-yaml`, `brace-expansion`, `source-map-js`). Registry
severity is not a completed runtime-reachability assessment. This pinned project is
not declared vulnerability-free. Broad suggested fixes would change the required
stack and were not applied. All **57** locked Bare/native-addon entries are unchanged.

The tracked history scan inspected 121 unique blobs, including decompressed transcript
text. Its only private-key-pattern matches were literal regex scanner code in genuine
tool records, not keys. No actual credentials or invite capabilities were found by
those checks. Generated native projects, worker bundles, APKs, signing material,
original transcripts and local evidence are excluded. License/NOTICE are unchanged.
No application source has a hardcoded developer checkout path. The inherited
`expo-linear-gradient` dependency is unused by Relay's UI but retained with the pinned
native baseline rather than removed during this final compatibility audit.

## Final execution evidence

An isolated local clone at commit `eb44007` was installed from its own lockfile and
built from generated native projects. It shared the host's SDK/npm/Gradle caches:
this verifies a fresh worktree, not a fresh operating system. The committed Pear
upgrade identifier worked unchanged; no new `pear touch` or private signer was needed.
Later source changes affect tests, invitation wording and documentation/transcript
evidence; storage, IPC, permissions and record schemas are unchanged.

| Executed check                 | Actual result / private evidence                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node/npm                       | 22.23.3 / 10.9.9; JDK 17; Android API 36 ARM64 owner-user AVDs                                                                                                                                       |
| `npm ci`                       | Passed in root and isolated checkout; deprecation/advisory warnings retained                                                                                                                         |
| `npx --yes pear@3.0.0 -v`      | Supported wrapper runs; installed Pear runtime reports 3.6.0                                                                                                                                         |
| `npm run check:upgrade`        | Passed unchanged in isolated checkout                                                                                                                                                                |
| `npm run bundle:bare`          | Passed after worker fixes; new bundle used by native builds                                                                                                                                          |
| `npm test`                     | Formatting/lint and all 27 application tests passed (`quality-budget.log`)                                                                                                                           |
| `npx tsc --noEmit`             | Passed in root and isolated checkout                                                                                                                                                                 |
| Python exporter tests          | 2 passed; literal record preservation and explicit privacy replacements                                                                                                                              |
| First clean test attempt       | 26/27; reconnect exceeded original 12s wait during native build (`clean-tests.log`)                                                                                                                  |
| Idle clean test rerun          | All 27 passed (`clean-tests-idle.log`); revised bounded wait separately passed                                                                                                                       |
| Clean debug command            | `npm run android -- --device Relay_Audit_QA`; native build/install/launch passed (`clean-debug.log`)                                                                                                 |
| Fresh debug notebook           | Create, add and restart persistence passed; empty/detail screenshots inspected                                                                                                                       |
| Clean release command          | `npm run production:android -- --no-bundler --device Relay_Audit_QA`; passed (`clean-release.log`)                                                                                                   |
| Standalone branding            | Metro stopped, 8081 reverse removed; actual launcher label/icon and captured splash frames inspected                                                                                                 |
| Debug three-peer UI            | A entry to B/C; B acknowledgment to A/C; reverse writes/removal, cancel confirmation, A/B restart (`debug-ui-results.json`)                                                                          |
| Android worker rejection       | Actual IPC rejects Viewer acknowledgment, spoofed identity and unknown entry; duplicate/idempotence, association/removal/restart passed (`debug-worker-results.json`)                                |
| Release three-peer UI          | Same core handoff, reverse write/removal and restart flow passed without Metro (`release-ui-results.json`)                                                                                           |
| Release offline/background     | B had Wi-Fi disabled and no active default network; local ack stayed absent on A/C, then replicated after restoration; cold restart and background/resume passed (`release-offline-background.json`) |
| Native sharing                 | Actual Copy text action, invitation cancellation, Viewer cannot invite (`final-sharing.json`)                                                                                                        |
| Fresh release pairing recovery | Invalid invite rejected; inviters force-stopped, pending join canceled; original notebooks retained and retry allowed (`fresh-cancellation.json`)                                                    |
| Fresh release Viewer join      | Actual Viewer role; existing entry/ack replicated; restart after invite cancellation retains access (`final-release-join.json`)                                                                      |
| Native logs                    | All six captured current-process debug/release logs report Autopass ready; no fatal native/addon patterns observed (`native-summary.json`)                                                           |

Warnings were retained: Gradle deprecations, color-environment notices, optional
DevTools download fallback, cached lint manifest paths, and a retried UIAutomator
null-root response. None is represented as a fatal addon failure or suppressed.
The requested `bare` tag filter was captured too; actual worker console output uses
`pearreactnative`, so current-process logs supply the startup evidence.
The first sandbox-only test run failed UDP socket binding (`EPERM`); the permitted
run, rather than that failure, supplies the passing network-test evidence.

Screenshots actually inspected include fresh welcome/empty/detail, editor, Viewer
handoff, sharing, invalid invitation, waiting-to-join, launcher, splash frames and
130% font home. The new native identity matches the UI mark. No additional visual
redesign was needed. Raw logs, APKs, screenshots and private originals remain in
ignored `.assessment-local/phase6/` and `.assessment-local/ai/`. Earlier phase reports
remain historical execution records, not claims that their original counts/assets
are the current state.

Accessibility coverage remains Android gesture-navigation emulators, checked font
scaling/contrast/touch targets and reduced-motion API. TalkBack spoken output, iOS,
physical devices, unusual cutouts and three-button navigation are not claimed tested.
Offline behavior was exercised on initialized notebooks; first-run offline creation
and forced disk-full/power-loss recovery were not exercised on Android.
The pinned Bare runtime failed in secondary Android user profiles; use independent
owner-user AVDs. Development-signed APKs are not production store releases.

## Remaining external actions

After authorship and transcript completeness/privacy are resolved, and only after
explicit publication approval: create a private repository, push the reviewed branch,
invite GitHub user `chocky335`, confirm collaborator access, verify private transcript
links/downloads and send the repository link. No repository, push, invitation,
submission message, npm publishing or Pear deployment was performed in this audit.

## Changed-file inventory

- Lifecycle/UI/tests: `src/worker/client.js`, `workers/library.js`, `src/PairingPanel.tsx`,
  `tests/client.test.js`, `tests/pairing.test.js`, `tests/handoff.test.js`.
- Branding: `app.json`, `assets/icon.png`, `assets/adaptive-icon.png`,
  `assets/splash-icon.png`, `assets/favicon.png`, `assets/relay-mark.svg`,
  `assets/README.md`, `scripts/render-branding.swift`.
- Reproducibility/hygiene: `package-lock.json`, `.github/workflows/ci.yaml`,
  removed `.github/workflows/publish.yml`, `.gitignore`.
- Documentation/evidence: `README.md`, `AGENTS.md`, `agent_docs/releases.md`,
  `docs/AI_USAGE.md`, `docs/AUDIT.md`, `docs/ai/.gitattributes`, `docs/ai/README.md`,
  `docs/ai/codex-visible.jsonl.gz`, `docs/ai/manifest.json`, `scripts/export-ai.py`,
  `scripts/tests/test_export_ai.py`.
