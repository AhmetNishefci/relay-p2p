# AI assistance disclosure

## Phase 1: environment setup and official template initialization

The candidate authorized Codex to inspect the environment, import the official
Holepunch template at commit `4ad3f8df5b5f20ce7621c42457795d53b2248c9b`,
install its locked dependencies, configure its Pear development upgrade link,
build and verify Android, document evidence, and create one setup commit.

Codex performed those setup actions and authored these assessment setup notes.
The React Native UI and Bare worker are upstream template code, not candidate-authored
code. No Autopass or Relay feature implementation is included in Phase 1.
The candidate selected Relay, acknowledgment handoffs, and the principal decisions
of sync state and pairing/trust after reviewing AI research recommendations.
No claim of manual authorship is made for AI-generated documentation or changes.

## Phase 2: Autopass and IPC foundation

The candidate authorized the scoped foundation after reviewing Phase 1. Codex
proposed the module boundaries, inspected the installed/source APIs, and generated
`workers/notebook.js`, `workers/requests.js`, the shared protocol/record validators
and declarations, RN client/runtime, the verification UI changes, and focused tests.
`workers/main.js` is based on copied upstream code with Codex-generated integration.
Codex also generated documentation changes and the local Android verification
harness, ran checks/builds, and exercised actual Android CRUD/restart flows.

These are AI-generated implementation changes, not candidate-authored code.
Candidate review and meaningful modification of core implementation remain pending;
no completed human review or edits are claimed. In particular the candidate should
review request validation and error mapping, timeout reconciliation, singleton
runtime ownership, record limits, and refresh coalescing, then make and explain
substantive changes where appropriate. Candidate-led pairing/product development
remains necessary; these setup/foundation phases do not establish compliance with
the restriction on fully AI-coded submissions by themselves.

The verification notes distinguish executed Node tests and Android results from
future peer tests. No pairing or acknowledgment behavior is implemented in Phase 2.

## Phase 3: pairing and trust

The candidate explicitly authorized pairing implementation and independent-peer
verification. Codex generated the library/manifest lifecycle, invite validation,
protocol extensions, worker permission/participant operations, pairing UI, and
focused tests. It also configured two fresh AVDs, investigated the upstream pairing
branch without patching dependencies, and generated local test drivers. Debug
Android actions used the existing RN client through the inspector and actual Bare
IPC; release actions used the native UI. No entries were imported directly into
Android storage to simulate replication. Actual results are in PHASE3.md.

This is AI-generated code. No candidate-authored edits or completed independent
review are claimed. Candidate review/meaningful modification of manifest activation,
cancellation races, invitation trust, and actual permission enforcement remain
outstanding. Pairing verification does not establish compliance with the prohibition
on fully AI-coded submissions; candidate-led product work is still required.

## Authentic records

Original Codex session identifier: `01a18158-3cb1-7e70-a804-2b4d3c33e634`.
The original JSONL is stored locally at:

```text
~/.codex/sessions/2026/10/28/rollout-2026-10-28T08-10-06-01a18158-3cb1-7e70-a804-2b4d3c33e634.jsonl
```

An unchanged byte snapshot is preserved under the gitignored directory
`.assessment-local/ai/`, with its cutoff and SHA-256 in `manifest.json`.
A literal visible-message/tool export is also preserved as
`.assessment-local/ai/visible-session.jsonl`; its hash and exact filtering are
recorded in the manifest. It excludes internal instructions/reasoning and duplicate
session events; message text and tool results are not summarized or redacted.

That snapshot contains the original research conversation and completed phase records
through the stated cutoff. The session continues after each snapshot; no snapshot
is represented as a complete transcript of messages that have not happened yet.
Refresh from the original session after the final response, before submission.
The local helper `python3 .assessment-local/preserve-ai.py` repeats the capture.

The raw local record is not committed because it can contain environment metadata,
internal session records, and private information. Before submission, preserve the
original securely and export the actual visible user/assistant messages and tool
calls/results. Any filtered or redacted export must identify its filtering and
redactions; it must not be called an unmodified original. This document and the
baseline report are summaries, not substitutes for transcripts.

Do not include the separate approval-review session as though it were candidate
conversation. Preserve future assessment sessions as well. Include actual code
suggestions, candidate edits/review, debugging assistance, and executed test results.
The candidate must lead subsequent product implementation and independently
understand and modify all submitted code; disclosure does not make a fully AI-coded
submission acceptable.
