# Phase 11B.2 — Android attachment workflow

Baseline: `4869b17ce9a810308433ce25c640b1675583d312`, clean `main` at start.
Product UI extends the existing editor/details/list; navigation, pairing, handoffs,
activity and notebook ownership remain unchanged. No push is authorized here.
[AI assistance disclosure](AI_USAGE.md) records generated implementation and QA.

## Native dependency review

Added exact SDK-map-compatible versions: expo-document-picker **55.0.16**,
expo-file-system **55.0.25**, expo-sharing **55.0.23**. Installed package metadata
and SDK 55 API source were inspected. FileSystem moved from transitive to direct
at its existing version. No existing resolved package version changed. Bare Kit
0.12.3, Pear Mobile 4.3.0, Autopass 3.4.1, Corestore 7.12.0 and Hyperswarm 4.17.0
remain unchanged. The existing 26 npm advisories were not hidden by broad upgrades.

Expo autolinking and module manifests add outgoing document/share capabilities;
no generated native file was edited. No Hermes crypto library, custom native module,
incoming-share extension or unrelated UI framework was added. Rebuild/install the
APK after npm ci. This change is not suitable for OTA into an earlier native APK.

## Creation and retrieval

- System picker accepts JPEG, PNG, PDF and plain text, one file at most 1 MiB.
  Unknown sizes, unsupported explicit MIME types and unsafe filenames fail clearly.
  A missing/generic MIME label may be inferred from one of the supported extensions;
  that is metadata validation, not content authentication or malware scanning.
- Picker cancellation leaves the existing draft intact. Native copying creates a
  private cached source after reported-size validation; actual size is checked again.
  The editor previews filename/type/size, allows removal/replacement and confirms
  destructive draft discard. Saved entries without attachments remain compatible.
- Save reserves a worker handle with immutable filename/type/size, copies natively
  into that controlled location and calls new `attachments.seal`. Bare derives
  BLAKE2b-256, then `entries.addAttachment` rereads/verifies bytes before the existing
  binary-first publication. Digest-supplied backend clients remain supported.
- Selection/copy/sealing failure requests no entry publication. Once publication is
  requested, existing unknown-outcome handling blocks automatic retries and keeps
  the draft for review. Success feedback follows the worker's confirmed response.
- Details lazily retrieve and verify a file, copy it natively into an opaque private
  sharing-cache directory and open Android's share sheet. Viewers can retrieve/share
  but cannot add/remove/acknowledge. Filename and accessible action labels wrap.
- Temporary worker handles are released after the share flow. A separate cache copy
  remains for external apps that read after chooser completion; files older than
  24 hours are eligible for cleanup on later app launch. This is not an exact expiry
  promise. The OS may clear cache earlier; external apps may retain their own copies.

No attachment bytes/base64 cross JSON IPC or need to enter React Native memory.
A 15-second copy deadline bounds the caller, not native I/O. A single lane remains
occupied until native settlement, and late output is removed. Size checks do not
claim to enforce a byte cap during a dishonest provider's stream. Backend 1 MiB
validation remains authoritative before publication. No file progress percentage,
remote-delivery badge, read receipt or verified-human identity is introduced.

## Executed checks and evidence

Automated coverage includes supported/unsupported selection metadata and size/type
boundaries; Bare sealing without a client hash; changed-file detection; Viewer seal
rejection; native-copy timeout lane retention and late cleanup; and all previous
real peer, permission, persistence and unknown-outcome tests. TypeScript, lint,
formatting, exporter tests and Bare bundling are required before commit.

Android debug built with the new native modules. Actual system picker selection,
oversize rejection, cancellation, remove-before-save and confirmed attachment
creation were exercised. A 20,480-byte text file was shared by A/B/Viewer C into a
separate emulator-only receiver, whose native SHA-256 matched the host fixture on
all three peers. A had been restarted into standalone release. No receiver code,
APK, emulator data or screenshots are part of the product or tracked submission.

The receiver is a minimal external Android ACTION_SEND activity. It reads the
URI through ContentResolver, hashes bytes with Java MessageDigest and displays/logs
only byte count and SHA-256. This verifies a real FileProvider grant and external
byte receipt, not merely chooser visibility. It is not evidence that arbitrary
third-party PDF/image viewers render documents correctly.

An initial generic UI harness looked for an offscreen heading after cancellation;
title/body were preserved. Another swipe started on the fixed editor footer rather
than its scroll area. Corrected QA derives gestures from actual ScrollView bounds.
A system target label also crossed the older harness's conservative bottom cutoff;
its actual valid center was used. These are harness corrections, not app fixes.
Debug logged an Expo CLI connection warning during native activity transitions;
standalone verification uses no Metro. Native fatal/addon failures are checked
separately from Gradle success.

TypeScript also caught a missing helper during an intermediate edit. The build
command had continued; that artifact was discarded, the helper corrected, and the
acceptance artifact rebuilt behind successful static gates. Lint/style failures
were fixed without disabling checks. Raw attempts remain distinct in ignored
`.assessment-local/phase11b2/` rather than being relabeled as successful runs.

## Final standalone acceptance

All **70 application tests**, four exporter tests, TypeScript, lint, formatting and
Bare bundling passed. `npm ci` from the final lockfile also passed. Debug and release
builds succeeded; the final release was installed on three independent API 36 ARM64
emulators, with Metro stopped and reverse forwarding removed.

| Verified flow               | Observed evidence                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact maximum-size text     | System picker accepted 1,048,576 bytes; A/B/Viewer C external receivers reported identical SHA-256 `3081839c27311e8459104d992e31e60297c782a0cc092aff06d210114b51fe30`                             |
| Restart                     | All peers restarted with the entry/ack preserved; B shared the same maximum-size bytes again                                                                                                      |
| Reconnect                   | B was force-stopped while A published a PDF; C received it, then B restarted and shared identical PDF bytes                                                                                       |
| PDF filename with spaces    | `Relay site report 2026 field notes.pdf`, 598 bytes; all three external receipts matched SHA-256 `339e7d29c73424b514515d03570a900e475ea852aeead1e2cbbd0beab6a30a30`                               |
| JPEG / PNG                  | Actual picker/save/share passed for an 815-byte generated JPEG and 26,954-byte original PNG fixture; receiver hashes matched host bytes                                                           |
| Permissions                 | Viewer could retrieve/share; add/remove/ack actions remained absent, with authoritative worker denials covered by tests                                                                           |
| Interaction / accessibility | Picker oversize rejection/cancellation, remove-before-save, canceled share sheet and repeated share passed; long filename wrapped at 130% font scale and Open/share target remained at least 48dp |
| Data restoration            | Only recorded test entry IDs were removed; all original 33 entries remained on each peer; font scale restored                                                                                     |

Screenshots were visually inspected, including selection and the long-filename
Viewer card at 130% font scaling. Original warmth, hierarchy and spacing remain;
content wraps without clipping and scrolls above native navigation. The receiver
is emulator-only QA tooling. No file fixtures were copied to B/C: their bytes came
through Autopass replication. Reconnect here is process disconnect/restart, not an
airplane-mode test. Transient UiAutomation null-root failures recovered within the
existing bounded read-only dump retry and are retained in raw logs.

## Limits

Android API 36 ARM64 emulators are the verified target. Physical devices, iOS,
cloud providers with unavailable metadata, hostile document providers, TalkBack
spoken output and arbitrary recipient applications are not claimed tested. The
backend still retains orphan binary records and has no aggregate storage quota or
replicated garbage collection. Acknowledgments bind entry IDs, not file revisions.
No new product implementation or publication is authorized beyond this milestone.
