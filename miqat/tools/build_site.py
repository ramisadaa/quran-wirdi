"""انسخ ملفات الموقع العامة فقط، مع استبعاد الأدوات وحصة الحساب وإعدادات Actions."""
from pathlib import Path
import argparse
import shutil

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='public')
args = parser.parse_args()
out = Path(args.output).resolve()
if out == root or root in out.parents and out.name in ['data', 'js', 'css', 'fonts', 'tools', 'assets']:
    raise SystemExit('Choose a separate output directory.')
if out.exists() and any(out.iterdir()):
    raise SystemExit("Output directory must be empty. Choose a new build directory.")
out.mkdir(parents=True, exist_ok=True)
for name in ['index.html', 'config.js', 'script.js', '.nojekyll', 'manifest.webmanifest', 'sw.js']:
    shutil.copy2(root / name, out / name)
for name in ['css', 'js', 'assets', 'fonts']:
    shutil.copytree(root / name, out / name, dirs_exist_ok=True)
(out / 'data').mkdir(exist_ok=True)
for name in ['duas.json', 'exchange-rates.json']:
    shutil.copy2(root / 'data' / name, out / 'data' / name)
from prepare_pwa import prepare
prepare(out)
print('Static site prepared. API keys and update ledger are not part of the deployed site.')
