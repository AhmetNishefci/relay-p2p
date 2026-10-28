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

That snapshot contains the original research conversation and Phase 1 records
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
