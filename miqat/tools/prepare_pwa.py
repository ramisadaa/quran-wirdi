"""Generate a content-versioned offline allowlist, including project-relative Pages paths."""
from pathlib import Path
import hashlib
import json
import re
import sys


def prepare(root):
    root = Path(root)
    files = [root / name for name in ['index.html', 'config.js', 'script.js', 'manifest.webmanifest']]
    for name in ['css', 'js', 'assets', 'fonts']:
        files.extend(path for path in (root / name).rglob('*') if path.is_file())
    files.extend(root / 'data' / name for name in ['duas.json', 'exchange-rates.json'])
    files = sorted(files)
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(path.read_bytes())
    worker = root / 'sw.js'
    text = worker.read_text()
    text = re.sub(r'const VERSION = ".*?";', 'const VERSION = "' + digest.hexdigest()[:16] + '";', text)
    text = re.sub(r'const SHELL = \[[\s\S]*?\];', 'const SHELL = ' + json.dumps(['./' + path.relative_to(root).as_posix() for path in files], ensure_ascii=False, indent=2) + ';', text)
    worker.write_text(text)
    return len(files)


if __name__ == '__main__':
    print('Offline shell prepared:', prepare(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]))
