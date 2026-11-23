"""Independent localhost review server for the fragmentation carousel."""
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import tempfile
import uuid

HERE = Path(__file__).resolve().parent
COMMENTS = HERE / 'comments.json'
ARCHIVE = HERE / 'comment-archive'
ARTWORK = HERE / 'opening-artwork.json'

def read_comments():
    try:
        doc = json.loads(COMMENTS.read_text())
        if doc.get('schema') == 'fragmentation-comments-v1' and isinstance(doc.get('comments'), list):
            return doc
    except (OSError, ValueError):
        pass
    return {'schema': 'fragmentation-comments-v1', 'comments': []}

def atomic_json(path, doc):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, prefix='.fragmentation-', delete=False) as handle:
        json.dump(doc, handle, indent=2, ensure_ascii=False)
        handle.write('\n')
        temp = handle.name
    os.replace(temp, path)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def send_json(self, doc, status=200):
        data = json.dumps(doc).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/comments':
            return self.send_json(read_comments())
        return super().do_GET()

    def do_POST(self):
        if self.path not in {'/api/comments', '/api/artwork'}:
            return self.send_json({'error': 'Unknown endpoint'}, 404)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 1 or size > 1_000_000:
                return self.send_json({'error': 'Invalid payload size'}, 413)
            payload = json.loads(self.rfile.read(size))
            if self.path == '/api/artwork':
                limits = {'originX': (0, 100), 'originY': (0, 100), 'earthSize': (35, 145),
                          'satCount': (0, 7251), 'dotSize': (35, 250)}
                if not isinstance(payload, dict) or set(payload) != set(limits):
                    return self.send_json({'error': 'Invalid artwork settings'}, 400)
                values = {}
                for key, (low, high) in limits.items():
                    value = payload[key]
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
                        return self.send_json({'error': 'Invalid artwork setting: ' + key}, 400)
                    values[key] = round(value)
                atomic_json(ARTWORK, values)
                return self.send_json(values)
            doc = read_comments()
            action = payload.get('action')
            if action == 'add':
                entry = payload.get('comment')
                if not isinstance(entry, dict) or not isinstance(entry.get('text'), str) or not entry['text'].strip() or len(entry['text']) > 4000:
                    return self.send_json({'error': 'Comment must be 1–4,000 characters'}, 400)
                safe = {key: entry.get(key) for key in ['slide', 'slideTitle', 'element', 'x', 'y', 'altitude', 'day', 'text']}
                safe.update({'id': uuid.uuid4().hex, 'createdAt': datetime.now(timezone.utc).isoformat(), 'status': 'open'})
                doc['comments'].append(safe)
            elif action in {'archive', 'archive-round'}:
                ids = [payload.get('id')] if action == 'archive' else payload.get('ids')
                if not isinstance(ids, list) or not ids or not all(isinstance(x, str) for x in ids):
                    return self.send_json({'error': 'Provide comment IDs to archive'}, 400)
                matches = [x for x in doc['comments'] if x.get('id') in ids and x.get('status') != 'archived']
                if len(matches) != len(set(ids)):
                    return self.send_json({'error': 'An ID is missing or already archived'}, 400)
                stamp = datetime.now(timezone.utc)
                archive_name = f'round-{stamp:%Y-%m-%d-%H%M%S}-{uuid.uuid4().hex[:6]}.json'
                atomic_json(ARCHIVE / archive_name, {'schema': 'fragmentation-comment-round-v1', 'archivedAt': stamp.isoformat(), 'comments': matches})
                for item in matches:
                    item['status'] = 'archived'
                    item['archivedAt'] = stamp.isoformat()
            else:
                return self.send_json({'error': 'Unknown action'}, 400)
            atomic_json(COMMENTS, doc)
            return self.send_json(doc)
        except (ValueError, TypeError, KeyError) as exc:
            return self.send_json({'error': str(exc)}, 400)

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('FRAGMENTATION_PORT', '8773'))), Handler).serve_forever()
