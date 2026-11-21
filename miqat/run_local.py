"""تشغيل التطبيق محليًا: python run_local.py"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

root = Path(__file__).resolve().parent
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
try:
    server = ThreadingHTTPServer(('127.0.0.1', 8787), handler)
except OSError:
    raise SystemExit('Port 8787 is in use. Close the previous server or use VS Code Live Server.')

url = 'http://127.0.0.1:8787/index.html'
print(f'Open: {url}\nKeep this window open. Press Ctrl+C to stop.')
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
