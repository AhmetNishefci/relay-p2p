# Phase 4: explicit acknowledgment handoffs

Relay now records an explicit acknowledgment action separately from the field entry.
This is application data replicated by Autopass, not a transport delivery receipt or
proof that a person read or understood anything. Pairing, permissions, and entry
management remain unchanged. Final visual design is deferred.

## Sync state decision

The user problem is distinguishing a completed local write from another peer's
explicit action. A single “synced” badge would claim information Autopass does not
provide. Connection counts and update events also cannot establish delivery.

Relay keeps **Saved on this device** for entry writes. A successful acknowledgment
operation says **Acknowledgment recorded on this device**. Entry snapshots show
acknowledgment counts, a record matching the actual local writer key, and records
observed for other device keys. Names are not inferred from those keys. The UI says
these are unverified records, not proof of reading. Even a local-key record could
have been written by another Contributor outside Relay's guarded IPC path.

Alternatives considered: embedding an acknowledgment array/counter in the entry;
a single shared boolean; a generic transport-based status; signed acknowledgments.
Separate keys avoid rewriting entry content and let different cooperative writers
record actions independently. The cost is extra records, explicit user interaction,
retention of orphan records, and no authenticated human attribution. Signed claims
would add key management/verification and still would not prove reading or establish
a human identity without a separate trust process. Identity requirements or a need
to bind acknowledgment to a specific content revision would change this design.

## Schema and operations

Autopass key: `ack:<entry-id>:<writer-key>`.
The value is a versioned JSON string:

```json
{
  "schemaVersion": 1,
  "kind": "ack",
  "entryId": "0123456789abcdef0123456789abcdef",
  "writerKey": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "acknowledgedAt": 1793181600000
}
```

Entry IDs must be 32 lowercase hex characters; writer keys must be 64 lowercase hex
characters. The timestamp must be a nonnegative safe integer. It is presentation
metadata, never a distributed ordering/conflict-resolution mechanism. Known fields
are normalized before IPC; malformed/key-mismatched records are counted visibly.

One operation is added:

```json
{
  "v": 1,
  "type": "request",
  "id": "42",
  "op": "entries.acknowledge",
  "payload": { "entryId": "0123456789abcdef0123456789abcdef" }
}
```

It returns `{ acknowledgment, alreadyRecorded }`. Bare enforces `pass.writable`,
checks the referenced entry through `get(key).value`, validates the entry, and derives
`writerKey` from `pass.writerKey`. UI-supplied identity or timestamp fields are rejected
at the protocol boundary. A Viewer receives `READ_ONLY`; an absent/unsupported entry
receives `ENTRY_NOT_FOUND`.

The existing serialized operation queue makes local concurrent duplicate requests
idempotent. A valid existing key/value is returned unchanged with `alreadyRecorded:
true`; no extra append is made. An invalid existing local-key acknowledgment yields
`INVALID_ACK` rather than silently overwriting retained data.

`entries.list` now returns:

```text
{
  entries, skipped,
  acknowledgments,
  localWriterKey,
  skippedAcknowledgments
}
```

This single snapshot lets the UI associate acknowledgments by entry ID and determine
whether a record matches its actual local key without one request/stream per entry.
Existing stored entry schemas are unchanged. Protocol version 1 gains additive
snapshot fields and the new operation; the updated client validates those fields.
A fresh worker bundle is required for this client. No dependency or native version
changed and no storage migration was performed.

The existing Autopass update subscription drives the existing coalesced list
refresher. There is no second update subscription or invented sync event. The UI
adds a per-entry action, pending/disabled states, success/error feedback, and count/
device-key information. Duplicate button submissions are prevented while pending
and once a local-key record is present; worker idempotence remains the authority.

Snapshots retain the existing 200-entry/1.5-million-character bounds and add a
1000-valid-acknowledgment bound, including retained orphan records. Exceeding a bound
fails visibly with `LIST_LIMIT`; records are never silently deleted or truncated.
Pagination/retention policy remains future work.

## Actual trust and conflict limits

The installed Autopass 3.4.1 put handler inserts the supplied record into the shared
key/value collection. Its apply context does not bind an acknowledgment's payload
writer key to the operation's author or enforce ownership of key prefixes. Inspect
`node_modules/autopass/index.js` (`@autopass/put`, `_apply`, `add`) and its schema.

A real two-Contributor test first observed A's acknowledgment on B, then explicitly
overwrote A's acknowledgment key through B's public `pass.add()` API. A then observed
the replacement. This confirms that another writable peer can forge, alter, or suppress a record claiming any writer key. Relay's
IPC prevents spoofing through its own UI; it does not impose a per-key ACL on all
Autopass writers. Encryption/writer membership does not make payload identity an
authenticated per-record assertion. No tamper-proof, verified-human, read, delivered,
or fully-synchronized status is claimed.

Different cooperative writers use different keys, so concurrent actions coexist.
Competing writes to the same key follow Autopass's materialized-view behavior, not
our timestamps. No conflict history or cryptographic authorship metadata is invented.

Acknowledgments reference an entry ID, not a content hash. Relay's current UI creates
new IDs and does not edit/reuse them. Another writer using Autopass directly could
replace content under an existing ID. A future editing feature needs revision-bound
acknowledgments if acknowledging specific content matters.

## Entry removal and races

Removing an entry removes only that entry key. Acknowledgment records remain stored
and replicate normally; snapshots filter out acknowledgments whose entry is absent
or unsupported. New acknowledgment requests for a removed entry fail. No destructive
cascade or startup cleanup is introduced.

Existence validation and an acknowledgment append are separate operations. A remote
deletion racing that append can leave a retained orphan, which the UI hides. Reusing
an old entry ID through an external API could expose its old acknowledgments again.
Neither deletion nor cancellation promises erasure of retained copies.

## Verification evidence

All raw evidence is local under gitignored `.assessment-local/phase4/`.

| Check                   | Actual evidence                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated tests         | 25 tests passed; `final-tests.log`                                                                                                                                   |
| Schema/IPC              | Invalid fields, spoofed UI identity, invalid timestamp, result validation                                                                                            |
| Idempotence             | Concurrent duplicates return the same value; repeated action makes no extra append                                                                                   |
| Persistence             | Exact acknowledgment and writer key survive Corestore close/reopen                                                                                                   |
| Permissions             | Real paired Viewer rejected; original CRUD/pairing tests retained                                                                                                    |
| Replication/concurrency | Real local DHT peers replicate acknowledgments; distinct concurrent device keys coexist                                                                              |
| Trust investigation     | Contributor B overwrites A's acknowledgment key and A observes it                                                                                                    |
| Entry removal           | Record remains physically stored but disappears from active snapshots; new acknowledgment rejected                                                                   |
| Android debug           | A entry → B action → A/C observation; duplicate, spoof, Viewer, unknown entry, unrelated update, restart, removal checks; `debug-handoff.json`                       |
| Android release         | A entry → B action → A/C observation; restart, unrelated update and deletion passed; `release-handoff.json`, original/resumed driver logs                            |
| Offline/reconnect       | Standalone B records with confirmed Wi-Fi disabled / no active default network; A/C remain at zero, then observe after restoration; `release-confirmed-offline.json` |
| Android restart         | First offline handoff survives another A/B force-stop/restart on all three peers; `release-final-restart.json`                                                       |

Commands executed with Node 22.23.3:

```sh
npm test
npx tsc --noEmit
npm run bundle:bare
npm run android -- --device Tether_API_36_ARM64
npm run production:android -- --no-bundler --device Tether_API_36_ARM64
```

The release APK was installed on all three emulators without clearing app data.
Metro was stopped and all 8081 reverse mappings removed before release UI checks.
The generated verified APK and its SHA-256 are retained locally as
`relay-handoff-verified-release.apk` and `release-apk.sha256`, excluded from Git.
No dependency versions changed; `package-lock.json` is byte-identical to Phase 3.

Debug tests invoke the existing RN client through the inspector and actual Bare IPC,
not direct Android Corestore writes. The shared-key overwrite demonstration occurs
only in isolated temporary Node test stores, not against existing Android entries.

Offline debug UI-driver attempts are preserved, including failures selecting a
flattened native ViewGroup and an attempt before restarted workers were ready.
These are not reported as passed offline tests. Stable text selectors and a startup
guard were added to the local harness. The decisive network-disconnection check is
performed in standalone release, where development-server connectivity cannot
interfere with UI operation. Original connectivity settings are restored in `finally`.
The first release run captured networking immediately after requesting disable, so
its initial snapshot still showed the prior connection. A second fresh-entry run
waited for `Wifi is disabled` and `Active default network: none` before B acted.
It passed: B recorded locally, A/C remained at zero, and both observed the record
after network restoration. No Metro server or reverse forwarding was present.

Release UI-driver failures and the resumed run are retained separately. A failing
accessibility dump included an Android `UiAutomationService` registration exception
and exit 137; it was not a Relay app-process exception. The local driver retries
transient dump failures and resumes against the same retained entry/data. Current
app-process logs show Autopass ready with no observed fatal Bare/addon error. Android
HWUI pixel-format and existing Gradle deprecation warnings remain.

An expanded concurrency test initially failed because its overwrite assertion did
not wait for B to observe A's original value, so it was testing competing concurrent
writes instead of a causally later replacement. The test now establishes that
precondition. No timestamp-based conflict rule or application workaround was added;
the failed run is retained as `tests-causality-failure.log`.

## Candidate ownership and remaining scope

The candidate must review and meaningfully modify the schema/meaning of an
acknowledgment, the shared-key trust model, idempotent write behavior, orphan retention,
and the distinction between local completion and observed record claims. The code,
tests, and documentation introduced here are AI-generated under authorization; no
candidate authorship or independent review is claimed. See [AI usage](AI_USAGE.md).

No final visual redesign, cryptographic receipt protocol, authenticated names,
attachment workflow, or GitHub publication is included in this phase.
