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
| Styled React Native UI/feedback     | Actual Android screenshot/interaction QA; native branding verification pending final build             |
| Atomic conventional commits         | Existing development history inspected; no rewriting or manufactured history                           |
| Setup/reproducibility               | Clean-checkout verification pending final build                                                        |
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
6. Reviewer transcripts were only available in ignored local storage. A checked-in,
   integrity-manifested redacted export and source exporter now provide reviewer access.
   Original records are not modified or falsely described as public/unredacted.

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
Remaining advisory scope/results are pending the final lockfile audit.

## Final execution evidence

Pending clean-checkout/native verification. Raw logs, APKs, screenshots and private
original transcripts remain in ignored `.assessment-local/phase6/` and
`.assessment-local/ai/`. Earlier phase reports distinguish executed runs and failures.

Accessibility coverage remains Android gesture-navigation emulators, checked font
scaling/contrast/touch targets and reduced-motion API. TalkBack spoken output, iOS,
physical devices, unusual cutouts and three-button navigation are not claimed tested.
The pinned Bare runtime failed in secondary Android user profiles; use independent
owner-user AVDs. Development-signed APKs are not production store releases.

## Remaining external actions

After authorship and transcript completeness/privacy are resolved, and only after
explicit publication approval: create a private repository, push the reviewed branch,
invite GitHub user `chocky335`, confirm collaborator access, verify private transcript
links/downloads and send the repository link. No repository, push, invitation,
submission message, npm publishing or Pear deployment was performed in this audit.
