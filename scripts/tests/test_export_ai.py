import collections
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('export_ai', Path(__file__).resolve().parents[1] / 'export-ai.py')
ai = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ai)

class TranscriptExportTest(unittest.TestCase):
    def test_preserves_literal_messages_and_order_but_excludes_internal_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'session.jsonl'
            records = [
                {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user', 'content': 'Original\nmessage'}},
                {'type': 'response_item', 'payload': {'type': 'reasoning', 'text': 'Internal'}},
                {'type': 'response_item', 'payload': {'type': 'custom_tool_call', 'input': 'Actual code suggestion'}},
            ]
            raw = ''.join(json.dumps(row) + '\n' for row in records).encode()
            source.write_bytes(raw)
            manifest = ai.export([source], root / 'export')
            data = gzip.decompress((root / 'export/codex-visible.jsonl.gz').read_bytes())
            self.assertEqual([json.loads(line) for line in data.splitlines()], [records[0], records[2]])
            self.assertEqual(source.read_bytes(), raw)
            self.assertEqual(manifest['sources']['session.jsonl']['sha256'], ai.sha(raw))
            self.assertEqual(len(data.splitlines()), 2)

    def test_marks_capabilities_credentials_paths_and_images_without_inventing_content(self):
        counts = collections.Counter()
        original = {'text': 'code ' + 'ghp_' + 'A' * 40 + ' /Users/private/Developer ' + 'ybnd' * 30,
                    'image': {'type': 'image', 'image_url': 'data:image/png;base64,UE5H'}}
        result = ai.redact(original, counts)
        self.assertIn('[CREDENTIAL REDACTED]', result['text'])
        self.assertIn('<HOME>/Developer', result['text'])
        self.assertIn('[POSSIBLE INVITE CAPABILITY REDACTED]', result['text'])
        self.assertIn('IMAGE WITHHELD', result['image']['image_url'])
        self.assertEqual(counts['image_fields'], 1)
        self.assertNotEqual(original, result)

    def test_masks_watchman_cookie_host_without_removing_application_code(self):
        counts = collections.Counter()
        result = ai.redact('root/.watchman-cookie-Private-Mac.local-123 styles.localStatus', counts)
        self.assertEqual(result, 'root/[WATCHMAN COOKIE REDACTED] styles.localStatus')
        self.assertEqual(counts['watchman_machine_identifiers'], 1)

    def test_masks_unrelated_project_names_but_preserves_assessment_paths(self):
        counts = collections.Counter()
        text = '/Users/private/Developer/private-project/src /Users/private/Developer/tether-wallet-assessment/src'
        result = ai.redact(text, counts)
        self.assertEqual(result, '<HOME>/Developer/<OTHER_PROJECT>/src <HOME>/Developer/tether-wallet-assessment/src')
        self.assertEqual(counts['unrelated_project_roots'], 1)

if __name__ == '__main__':
    unittest.main()
