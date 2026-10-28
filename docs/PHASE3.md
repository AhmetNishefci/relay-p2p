# Phase 3: pairing, trust, and independent peers

This milestone adds Contributor/Viewer invitation flows and real replication.
It does not implement acknowledgment handoffs or final visual design.
See [Phase 2](PHASE2.md) for the underlying entry schema and IPC foundation.

## Pairing and trust decision

**Problem:** an invitation grants notebook access, but a device label does not
establish who controls that device. Users also need a clear distinction between
read-only access and permission to mutate the notebook.

Options considered: silently accepting capabilities; accounts/verified identity;
or explicit capability sharing with truthful permission labels. Relay chooses the
last option for a small account-free P2P workflow.

The inviter selects Contributor or Viewer. Invite possession grants access, so the
UI asks users to share through a trusted channel. The accepting peer displays its
actual `Autopass.writable` capability after joining, rather than assuming a claimed
role from pasted text. Names are unverified; shortened writer keys distinguish key
records without proving human identity. There are no invented owner/admin roles.
Contributors can also create invitations because the underlying API grants that
ability to writable peers; a special administrator role is not implemented.

Trade-offs: no verified person identity, per-entry sharing, or erasure/revocation of
copies already received. A writable peer can write arbitrary application records.
Viewer restrictions are enforced in Bare, in addition to UI disabling. Future
acknowledgment mutations must go through the same writable guard. Signed identity
requirements, evidence of invitation abuse, or a requirement for explicit admission
approval would justify revisiting this design.

The known participant roster combines `listWriters()` with the actual local writer
key/capability. Autopass's collection may omit the initial creator; the UI explains
this instead of inventing a complete roster or online count.

## Verified Autopass 3.4.1 behavior

Source: installed `node_modules/autopass/index.js` and upstream
[versioned implementation](https://github.com/holepunchto/autopass/blob/6d3be5fc798cbb2174d55e1fab49674cdd14b6c0/index.js).

- `createInvite({ readOnly })` returns a z32-encoded capability. A same-role existing
  invite is reused; changing role deletes it and creates another.
- The decoded invitation includes a secret seed used to derive the invitation key
  pair, along with discovery metadata. Treat the whole string as capability material,
  regardless of the encoding's `sensitive` flag. No full invitation is logged.
- `deleteInvite()` deletes the current invite in the local replicated view. It does
  not revoke access already granted or erase data on another device.
- `Autopass.pair(store, invite, { name, bootstrap })` creates a pairer. Production uses
  default networking; tests may inject a local DHT bootstrap. `name` is self-reported.
- `finished()` resolves to a paired instance; Relay registers it immediately and also
  observes `pair.ready()` errors. It then awaits the paired instance's `ready()`.
- `pair.close()` cancels local pairing resources. Cancellation/timeout does not prove
  that an inviter never granted remote access. Success transfers resources to the
  Autopass instance; Relay does not close the successful pairer while that instance
  is active.
- `writable` and `writerKey` report actual local capability and local writer identity.
  `listWriters()` streams access records; no online/presence inference is made.

### Completion-hang investigation

The initial three-node local discovery probe timed out. Repeating with the upstream
test suite's ten-node DHT setup paired both roles and replicated data successfully.
Normal Android pairing also completed without a workaround.

A controlled call to `_whenWritable()` with a real already-writable paired instance
reproduced its early return without resolving `finished()`. This exercises the
suspected branch; it is not evidence that normal joining naturally hit that branch.
No upstream source or installed package was patched. Immediate `finished()`
registration plus bounded local cancellation prevents an unbounded UI wait, but
cannot claim to fix every upstream race. The probe is retained locally as
`.assessment-local/phase3/probe-pairing.cjs` and its output as `pairing-probe.log`.

## Storage and migration

`workers/library.js` owns an active-store manifest under `pear.storage/relay`:

```text
relay/
  active.json             { "version": 1, "directory": "..." }
  notebook/               existing Phase 2 store, adopted without copying/resetting
  notebooks/<random-id>/  explicitly created fresh notebook
  joins/<random-id>/      unique storage for each join attempt
```

Fresh installations start idle and show Create/Join. Existing Phase 2 stores are
opened in place and recorded in the manifest. A valid active manifest always wins;
corrupt/missing active storage fails visibly without deleting data or silently
creating a replacement.

A store is promoted only after initialization succeeds, using a same-directory
manifest rename. Existing active notebooks cannot be replaced or switched by the
Create/Join operations (`ALREADY_OPEN`). Failed/canceled join directories remain
untouched and are not automatically resumed or activated. Another attempt uses a
new directory. This keeps one active notebook without adding notebook navigation.
Atomic rename is not a claim of power-loss durability or secure deletion.

Join states are explicit: worker state `joining`, with pairing `joining`,
`cancelling`, `cancelled`, or `failed`. A 60-second worker timer closes a timed-out
attempt; cancellation runs outside the entry-operation queue so it can interrupt a
pending join. Duplicate joins are rejected. Cleanup errors require app restart.
Backgrounded worklets suspend with the OS; the UI asks both peers to remain open.
On resume an overdue timer can cancel the attempt. No background pairing guarantee
or automatic ambiguous-operation retry is offered.

## IPC additions

Requests retain protocol version 1 and request IDs. New operations:

| Operation           | Payload                     | Result                           |
| ------------------- | --------------------------- | -------------------------------- |
| `notebook.create`   | `{}`                        | Actual worker status             |
| `invite.create`     | `{ readOnly: boolean }`     | `{ invite, readOnly }`           |
| `invite.cancel`     | `{}`                        | `{ cancelled: true }`            |
| `pair.start`        | `{ invite, name?: string }` | Current joining status           |
| `pair.cancel`       | `{}`                        | `{ cancelled: true }`            |
| `participants.list` | `{}`                        | Serializable participant records |

Status adds idle/joining states, `hasNotebook`, `pairing`, and hex `writerKey`/null.
State notifications reuse the existing status-shaped `ready` event; clients inspect
its `state` rather than interpreting every notification as data readiness.
Invitation decoding/expiry checks occur in Bare. Unknown/malformed messages retain
structured errors. Invite/participant mutations use the existing writable guard;
Viewer add/remove/invite requests receive `READ_ONLY` from the worker.

`fs`/`path` imports map to Bare implementations when bundling and Node built-ins in
local tests. Declared dependency promotions use existing versions: bare-fs 4.8.0,
blind-pairing 2.3.1, z32 1.1.0, and test-only hyperdht 6.33.1. No existing package or
native addon version changed.

## Independent peer environment

Three distinct API 36 ARM64 AVDs run the same application ID with independent data:

| Peer | AVD / ADB serial                    | Observed Wi-Fi address | Actual role                             |
| ---- | ----------------------------------- | ---------------------- | --------------------------------------- |
| A    | Tether_API_36_ARM64 / emulator-5554 | 10.0.2.16              | Contributor, original notebook retained |
| B    | Relay_Peer_B / emulator-5556        | 10.0.2.17              | Joined Contributor                      |
| C    | Relay_Viewer_C / emulator-5558      | 10.0.2.18              | Joined Viewer                           |

The Mac has 24 GiB RAM and emulator 37.2.12. New AVDs use the already installed
system image. `avdmanager` emitted a missing `devices.xml` warning but created valid
AVDs that booted and ran the app. No existing AVD was reset or overwritten.

Android documents shared Wi-Fi for emulator 36.5 and newer:
[interconnecting emulator instances](https://developer.android.com/studio/run/emulator-networking-interconnect).
Addresses alone were not treated as proof. Actual Autopass pairing and record
replication were observed between the apps using default discovery/networking,
with no custom application server, broker, or data import. Hyperswarm/DHT discovery
infrastructure is still involved; serverless application data does not mean no
network infrastructure exists.

## Executed evidence

All local files below are under gitignored `.assessment-local/phase3/`.

| Verification                         | Actual result / evidence                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing + new automated tests       | 20 passed, zero failures; `all-tests-final.log`                                                                                                               |
| Migration and safe create            | Real local store adopted in place; fresh create/reopen; active replacement rejected; `pairing.test.js`                                                        |
| Corrupt storage metadata             | Visible initialization failure; manifest and retained data unchanged; `pairing.test.js`                                                                       |
| Local network pairing                | Real Contributor/Viewer, bidirectional CRUD, read-only rejection, reconnect; `pairing-tests.log`                                                              |
| Cancellation/timeout                 | Local pairer closed, no active manifest, distinct retained attempt directories; `pairing.test.js`                                                             |
| TypeScript / formatting / lint       | Passed; `tsc.log`, `all-tests-final.log`                                                                                                                      |
| Bare bundle                          | Rebuilt after worker changes; `bundle.log`                                                                                                                    |
| Android debug build                  | Passed; `debug-build.log`                                                                                                                                     |
| Actual Android A/B pairing           | Contributor join, A→B entry, B→A entry, B removal→A; `android-replication.json`                                                                               |
| Actual Android Viewer                | Read replication, actual writable false, Bare rejects add/remove/invite; `android-viewer-results.json`                                                        |
| Android invalid/canceled join        | Worker rejects invalid invite; canceled attempt returns idle without notebook activation; `android-viewer-results.json`                                       |
| Android release build                | Passed in 9 seconds; `release-build.log`                                                                                                                      |
| Standalone release multi-peer flow   | UI-driven A→B/C, B→A, deletion→A/C, restart persistence and reconnect passed; `release-peer-results.json`, `release-ui.log`                                   |
| Background/resume                    | B sent Home, A wrote through release UI, B resumed and received the entry; `background-resume.json`                                                           |
| Standalone isolation and native logs | No Metro listener or 8081 forwarding; all peers logged Autopass ready; no observed fatal native error; `release-a.log`, `release-b.log`, `release-viewer.log` |
| Verified APK preserved               | `relay-pairing-verified-release.apk`; SHA-256 in `release-apk.sha256`; generated artifact excluded from Git                                                   |

Debug actions used the existing RN client via the development inspector, not a
second implementation or direct Corestore writes. Viewer mutation attempts thus
crossed the real FramedStream into the real Android Bare worker despite disabled
UI controls. Initial UI-driver tap/keyboard navigation failures were identified as
harness failures before pairing; they were not reported as replication failures.
Release verification uses actual fields/buttons and native UI hierarchy assertions.
The release driver initially failed because Android's stylus-handwriting onboarding
overlay intercepted input (confirmed by screenshot and input-method state), not
because a write or replication was observed to fail. The emulator-only secure setting
`stylus_handwriting_enabled` was changed to `0` on the three AVDs; original values
were saved in `emulator-input-settings.json`. No application data was reset. The
local driver uses Escape to dismiss input rather than accidentally finishing the
activity with Back. These environment corrections must not be represented as app
or networking fixes.

Peer A intentionally retains its previously created notebook and entries. Fresh
notebook creation is exercised by real local service tests; Android B and C exercise
fresh joining. No application data was reset merely to stage a new-create demo.

## Limits and review areas

No acknowledgment handoff, verified human identity, remote delivery receipt, owner
role, remote erasure, or conflict UI is implemented. Process disconnect/reconnect and actual Home/resume are tested; airplane-mode,
hostile NAT, and cross-network conditions are not tested. Joining
may fail on networks that block discovery/holepunching. Canceled/failed directories
remain on disk by design; future cleanup needs an explicit data-retention policy.

Core review areas are the admission trust model, manifest activation/recovery,
completion/cancellation races, permission checks and invitation disclosure.
Development attribution is documented in [AI assistance disclosure](AI_USAGE.md).
