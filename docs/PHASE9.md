# Final submission readiness audit

Audited source: `4830976dfe59b5a3a238f4b4625f9d299d30a3b9`, branch `main`, initially
clean. The final audit changes documentation and the genuine AI export only; no
application source, protocol, dependency, native configuration or feature changed.

Technical verification passed within the platform and test limits recorded below.
Publication and reviewer access remain pending authorization. The audit did not
establish authorship-policy eligibility or independent candidate code review;
[AI assistance disclosure](AI_USAGE.md) describes the recorded workflow and policy context.

The [live assessment](https://gist.github.com/chocky335/f4d214c26a64307a94f6ec46b9620c80)
was retrieved on October 28, 2026 through GitHub's public Gist API after the HTML
reader failed. Retrieved revision: `af93ff8161b77eee0fce7b9ccc323e6e06121ea7`.
The recruiter's **22:00 Kosovo** deadline takes precedence over its generic one-week
submission wording. No new product feature was implemented during this audit.

## Requirement reconciliation

| Requirement                                                        | Finding                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start at template `4ad3f8d`                                        | Verified. Full official archive comparison found 25 byte-identical files; differences were setup documentation, ignore rules and package.json upgrade only. LICENSE, NOTICE and lockfile match `40f7c8d`.                |
| Copy worker, remap pear-runtime to pear-mobile                     | Verified in actual worker source, preserving argv, updater/control handling and cleanup.                                                                                                                                 |
| Declare copied worker dependencies at locked versions              | Verified all seven required direct dependencies against the original lockfile. Existing bare/native versions remain unchanged.                                                                                           |
| Separate persistent Autopass Corestore under pear.storage          | Verified source/storage lifecycle; Android restart and retained notebook checks cover behavior.                                                                                                                          |
| Add/remove/list/listen for updates                                 | Implemented in Bare with validated IPC, async stream consumption, permissions and coalesced UI refresh; verified tests/runtime.                                                                                          |
| Novel P2P interaction and rationale                                | Separate explicit acknowledgment records replicate from another Contributor, including offline/reconnect. README explains the field handoff purpose and trust limits.                                                    |
| TWO implemented decisions                                          | README has exactly two principal decisions: Sync state and Pairing/trust. Both cover problem, alternatives, choice, rationale, sacrifices and reconsideration conditions.                                                |
| Styled UI and interaction feedback                                 | Actual Android UI/screenshots verified; Activity filters, loading/error recovery, deletion confirmation, role-specific actions and font scaling documented in Phases 5/8.                                                |
| Atomic type(scope) commits                                         | Coherent history retained. Two historical subjects omit scope: `4f5960a` and `eb44007`. This is a strict-format deviation; history was not rewritten.                                                                    |
| Runnable README                                                    | Fresh tracked-file checkout installed, checked and built using the documented toolchain and Android commands. Nvm prerequisite wording was clarified.                                                                    |
| AI logs and accurate disclosure                                    | Genuine visible-record export, integrity manifest and private original checkpoint provided. It is explicitly filtered/redacted, not an unmodified complete original. Other AI use still requires candidate confirmation. |
| Candidate authorship / ability to explain and modify independently | Not established by this audit. Candidate direction, AI-generated implementation and review evidence are distinguished in AI_USAGE.md.                                                                                    |
| Private GitHub URL and reviewer access                             | Pending explicit publication authorization. No repository, remote, push or invitation was created.                                                                                                                       |
| Files / iOS                                                        | Optional; attachments not implemented and iOS not claimed as verified. Pairing is implemented as an optional bonus.                                                                                                      |

## Fresh-checkout reproducibility

A detached temporary Git worktree outside the submission directory began with no
`node_modules`, generated native folders or worker bundle. It shares Git objects,
not the original dependency/native build directories. The submission stayed on
`main`; no remote was added. Local evidence records the temporary path and exact logs.

Executed with Node **22.23.3**, npm **10.9.9**, Homebrew JDK **17.0.20.1**, Apple Silicon
macOS, installed Android API **36** / ARM64 tools, and SDK licenses accepted. NDK
**27.1.12297006** and library NDK **27.0.12077973** / API 34 were already installed.
Global npm/Gradle caches and the installed SDK were available; this proves fresh
source installation/build behavior, not a cache-free new machine or byte-identical APK.

| Command / check                                   | Executed result                                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                          | Passed; 950 packages installed from the committed lockfile, no manifest/lockfile changes.                                                                |
| `npx --yes pear@3.0.0 -v`                         | Passed; wrapper reported Pear runtime CLI 3.6.0.                                                                                                         |
| `npm run check:upgrade`                           | Passed with the committed identifier; no `pear touch` regeneration or private signer required. Syntax validation is not proof of a deployed OTA payload. |
| `npm run bundle:bare`                             | Passed in the fresh checkout.                                                                                                                            |
| `npx tsc --noEmit`                                | Passed.                                                                                                                                                  |
| `npm test`                                        | Formatting, lint and all 51 application tests passed; 0 failures/skips.                                                                                  |
| Python exporter tests                             | All 4 passed.                                                                                                                                            |
| Fresh Android generation + debug/release assembly | Passed; 525 Gradle tasks executed. No native or node_modules directories were copied from the submission workspace.                                      |
| README debug command                              | Passed from fresh checkout; existing 33-entry notebook and Activity rendered.                                                                            |
| README standalone release command                 | Passed from fresh checkout; cold-launch/peer results below.                                                                                              |

Native generation was run explicitly before installation to compare signing
certificates, an audit safety step rather than an extra normal setup prerequisite.
Fresh debug/release certificates matched the verified APK before any replacement;
all installs used `-r`, never uninstall/clear-data. Expo normally performs native
generation automatically in the README run commands. No prebuild package changes
were made despite the newer recommended RN patch warning.

The committed upgrade identifier works for local worker startup in the fresh build.
Actual Pear OTA deployment/apply, store signing and distribution are not verified or
required here. Release uses the template's development signing configuration.

## Runtime verification

The independently built release passed the actual three-peer flow on original
emulators A/B/C (`5554`, `5556`, `5558`):

- Initial Activity counts matched: 49 All / 16 acknowledgment records / 17 entries
  without a locally visible acknowledgment.
- A new A entry reached B/C. B recorded an acknowledgment with Wi-Fi disabled and
  no active default network; A/C remained without it until connectivity returned.
- A/C then observed it automatically, and all three force-stop/restarts reconstructed
  the same persisted row. Hardware/header Back preserved the selected filter.
- Contributor removal returned to Activity; the Viewer handled remote removal while
  its detail was open. Viewer acknowledgment/removal actions were absent. Bare write
  enforcement is also checked by the real Autopass automated tests and source audit.
- Only the generated entry was removed. Original peers returned to 33 entries and
  the original Activity counts; network settings were restored.

A fresh isolated fourth store additionally verified invalid invite recovery,
cancellation with inviting Contributors stopped, subsequent Viewer admission,
replication of a retained baseline entry/acknowledgment, and persistence after the
invitation was canceled. Actual capability was Viewer; cancellation did not revoke
its already granted access. Existing Contributor peers and automated tests cover
Contributor writes/admission; no new owner/admin capability is claimed.

The first pairing harness attempt expected the notebook heading while A/B were
scrolled to older entries. Screens were inspected and normalized by relaunching
without clearing data; the failed attempt was retained and not counted as a pass.
An initial archive-verifier allowlist also omitted the expected setup README
modification; inspection confirmed a documentation-only difference, and the complete
source comparison then passed. Final current-process logs on all original peers show `[relay] Autopass ready` with
no fatal/native-binding error matches. Original Viewer C was restored; all three
cold-launched the fresh release with 33 entries and 49 Activity records. Metro and
reverse forwarding were absent. Fresh-checkout debug and final Viewer Activity
screenshots were also visually inspected. App/data were never uninstalled or cleared.

Tests use independent API 36
ARM64 Android emulators; no physical device or iOS result is claimed. Controlled
debug response delay/failure tests do not claim storage-corruption or native-crash
recovery. Previously verified Activity font/target measurements remain in Phase 8.

## Security, privacy and repository hygiene

- The baseline's 72 tracked files and 181 unique reachable historical blobs were
  inspected, including decompressed AI exports. No credential/private-key pattern
  findings or tracked generated/private artifacts were found. These are heuristic
  scans, not proof that every possible secret format is absent. Final audit/export
  changes are checked again before commit.
- Generated native projects, node_modules, APKs, emulator data, screenshots, raw
  private session snapshots, caches, signing files and local credentials are ignored.
  Intended original branding assets and the declared privacy-redacted export remain tracked.
- LICENSE/NOTICE are unchanged. Git object integrity passed. No history rewrite,
  backdating, branch replacement or publication was performed.
- Current npm audit reports **26 advisories: 9 low, 4 moderate, 13 high, 0 critical**.
  Findings include tooling/transitive packages such as Expo CLI, node-forge,
  image-size and js-yaml. Severity alone does not establish shipped-app exploitability.
  They remain documented; no dependency upgrade was authorized in this phase.
- Viewer mutations are rejected in Bare. Invitations are bearer capabilities, not
  verified identities. Canceling an invite is not participant revocation or a
  guarantee every outstanding invite disappeared. Shared Contributors can overwrite
  keys; acknowledgment identity/content claims are not tamper-proof.
- Device timestamps are presentation data. Activity is a current-record projection,
  not a durable audit history or a delivery/read/synchronization-complete indicator.
- Timeouts do not cancel accepted writes. No automatic mutation replay is performed;
  users reconcile a fresh view before retrying. Exactly-once adds are not provided.

## AI evidence and remaining actions

Today's available metadata identifies one assessment conversation plus five internal
approval-review sessions. The known conversation is exported from its authentic
original; internal review sessions are not passed off as candidate conversations.
Internal instructions/reasoning and image data are not published. Privacy replacements
are declared and counted, with original/export hashes in the manifest. Other tools,
earlier sessions require candidate confirmation; development roles are documented in
[AI assistance disclosure](AI_USAGE.md).

The export has an explicit cutoff. This session continues after capture; refresh it
after the final reply before publication. It covers captured visible records with
declared redactions; it is not an unredacted original or evidence of human code review.

Before submission:

1. Review the development disclosure against the assessment's AI policy; eligibility
   was not established by this audit. Confirm and include any additional AI assistance.
2. Review the known trust/dependency limitations and two historical commit-scope
   deviations. Do not rewrite development history to create a manual-work appearance.
3. Refresh/review the transcript export after the final response; verify its hashes.
4. Obtain explicit publication authorization. Create a **private** GitHub repository,
   push the verified main history, invite **chocky335** (`b.pomohaibo@gmail.com`), and
   verify the repository remains private and reviewer invitation/access state is correct.
5. Submit the private repository URL before **22:00 Kosovo**, preferably by 21:30.
   Preserve the unconditional **20:30 freeze** and final 90-minute submission reserve.

No external publication, reviewer contact or submission was performed by this audit.
