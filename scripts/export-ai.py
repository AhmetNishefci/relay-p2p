#!/usr/bin/env python3
"""Export genuine visible Codex records with declared privacy redactions.

The source JSONL is never modified. Images stay private. This is a filtered,
redacted transcript export, not an unmodified original or a conversation summary.
"""
import argparse
import collections
import datetime
import gzip
import hashlib
import json
import re
from pathlib import Path

CAPABILITY = re.compile(r'(?<![a-z0-9])[ybndrfg8ejkmcpqxot1uwisza345h769]{80,512}(?![a-z0-9])')
TOKEN = re.compile(r'gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{24,}')
HOME = re.compile(r'/Users/[^/\s"\'`\\]+|/home/[^/\s"\'`\\]+')
BASE64 = re.compile(r'(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{160,}={0,2}(?![A-Za-z0-9+/])')
PRIVATE_KEY = re.compile(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----', re.S)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def visible(record):
    if record.get('type') != 'response_item':
        return False
    p = record.get('payload', {})
    if p.get('type') == 'message':
        return p.get('role') == 'user' or (p.get('role') == 'assistant' and p.get('channel') in (None, 'commentary', 'final'))
    return p.get('type') in ('custom_tool_call', 'custom_tool_call_output', 'function_call', 'function_call_output')

def redact(value, counts, image=False):
    if isinstance(value, dict):
        is_image = value.get('type') in ('image', 'input_image', 'output_image')
        return {k: redact(v, counts, is_image and k in ('data', 'image_url', 'url')) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, counts, image) for v in value]
    if not isinstance(value, str):
        return value
    if image or value.startswith('data:image/'):
        counts['image_fields'] += 1
        return '[IMAGE WITHHELD; private original SHA-256: ' + sha(value.encode()) + ']'
    for pattern, kind, replacement in [
        (PRIVATE_KEY, 'private_keys', '[PRIVATE KEY REDACTED]'),
        (TOKEN, 'credentials', '[CREDENTIAL REDACTED]'),
        (CAPABILITY, 'possible_invite_capabilities', '[POSSIBLE INVITE CAPABILITY REDACTED]'),
        (BASE64, 'encoded_machine_or_binary_data', '[ENCODED MACHINE/BINARY DATA REDACTED]'),
        (HOME, 'home_paths', '<HOME>'),
        (re.compile(r'[\w.+-]+@unknown'), 'machine_identifiers', '<MACHINE_ID>'),
    ]:
        value, count = pattern.subn(replacement, value)
        counts[kind] += count
    return value

def export(sources, destination):
    destination.mkdir(parents=True, exist_ok=True)
    counts = collections.Counter()
    records = []
    provenance = {}
    for source in sources:
        raw = source.read_bytes()
        rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
        selected = [row for row in rows if visible(row)]
        records.extend(redact(row, counts) for row in selected)
        provenance[source.name] = {
            'sha256': sha(raw), 'bytes': len(raw),
            'last_timestamp': rows[-1].get('timestamp') if rows else None,
            'visible_records': len(selected)
        }
    data = ''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in records).encode()
    compressed = gzip.compress(data, mtime=0)
    (destination / 'codex-visible.jsonl.gz').write_bytes(compressed)
    manifest = {
        'description': 'Genuine visible records, filtered and privacy-redacted; not an unmodified original.',
        'captured_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sources': provenance,
        'export_file': 'codex-visible.jsonl.gz',
        'export_sha256': sha(compressed), 'decompressed_sha256': sha(data),
        'exported_records': len(records), 'redaction_counts': dict(counts),
        'selection': 'Visible user/assistant messages and tool calls/results only; internal instructions/reasoning and duplicate session events excluded.',
        'privacy': 'Image data withheld; possible long z-base32 capabilities, credential patterns, long encoded machine data, private keys, home paths and machine identifiers replaced with explicit markers. No text summarized.',
        'cutoff': 'Ongoing session: records after capture are absent. Refresh after the final response before publishing.',
        'completeness': 'This known Codex session is accounted for. Other AI use requires candidate confirmation; no qualifying human code contribution is evidenced.'
    }
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, action='append', required=True)
    parser.add_argument('--output', type=Path, default=Path('docs/ai'))
    args = parser.parse_args()
    manifest = export(args.source, args.output)
    print(json.dumps({'exported_records': manifest['exported_records'], 'sha256': manifest['export_sha256'], 'redaction_counts': manifest['redaction_counts']}))
