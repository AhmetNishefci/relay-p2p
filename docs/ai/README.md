# Actual AI assistance transcript

Download [codex-visible.jsonl.gz](codex-visible.jsonl.gz) and read the
[manifest](manifest.json). This is a **filtered, privacy-redacted export of genuine
visible Codex records**, not an unmodified original and not a conversation summary.
Message/tool text is preserved literally except for declared replacements.

The export contains user/assistant messages and tool calls/results. It excludes
internal instructions/reasoning and duplicate internal session events. Image data
is withheld to avoid publishing private screenshots. Possible capability strings,
credential patterns, long encoded machine data, private keys, home paths, unrelated project roots and machine
identifiers are replaced with explicit markers. The manifest gives redaction counts,
source hashes, export hashes, record count and the capture cutoff.

Verify and read using Python 3 (no extra packages):

```sh
python3 - <<'PY'
import gzip, hashlib, json
from pathlib import Path
root = Path('docs/ai')
m = json.loads((root / 'manifest.json').read_text())
b = (root / m['export_file']).read_bytes()
assert hashlib.sha256(b).hexdigest() == m['export_sha256']
data = gzip.decompress(b)
assert hashlib.sha256(data).hexdigest() == m['decompressed_sha256']
rows = [json.loads(line) for line in data.splitlines()]
assert len(rows) == m['exported_records']
print('Verified records:', len(rows))
# rows contain the actual message and tool payloads.
PY
```

Unmodified originals and byte snapshots remain private; they are not committed.
They can be compared with the source hashes by the candidate. A reviewer cannot
independently access a candidate's local Codex session store. This export supplies
reviewable evidence without publishing those raw private records.

To refresh from an authentic original after this ongoing session ends:

```sh
python3 scripts/export-ai.py --source /path/to/original-session.jsonl
```

Pass `--source` again for each additional relevant session. Review the generated
redactions and metadata before committing; patterns cannot establish that arbitrary
private text is safe. Refresh after the final assistant response before publication.
The export does not establish compliance with the prohibition on fully AI-coded
submissions. See [AI usage](../AI_USAGE.md) for authorship status.
