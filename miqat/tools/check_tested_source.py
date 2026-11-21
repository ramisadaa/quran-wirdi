"""Never deploy concurrent app changes that were not in the completed CI run."""
from pathlib import Path
import os
import subprocess
root=Path(__file__).resolve().parents[1]
try:
    changed=subprocess.check_output(['git','diff','--name-only','--no-renames',os.environ['TESTED_SHA'],'HEAD'],cwd=root,text=True).splitlines()
except Exception:
    raise SystemExit('Unable to compare final source with the tested revision.') from None
allowed={'data/exchange-rates.json','data/exchange-update-state.json'}
if any(path not in allowed for path in changed):
    raise SystemExit('Application source changed after CI. Rates are preserved; allow the newer code-push workflow to test and deploy it.')
print('Final application source matches the tested revision; only shared currency data may differ.')
