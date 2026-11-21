from pathlib import Path
import importlib.util
import subprocess
import tempfile

source=Path(__file__).resolve().parents[1]/'tools/push_changes.py'
spec=importlib.util.spec_from_file_location('publish',source);publish=importlib.util.module_from_spec(spec);spec.loader.exec_module(publish)
def git(root,*args):
 result=subprocess.run(['git',*args],cwd=root,capture_output=True,text=True)
 assert result.returncode==0,result.stderr
 return result.stdout
with tempfile.TemporaryDirectory()as tmp:
 root=Path(tmp);remote=root/'remote.git';local=root/'job';other=root/'author'
 git(root,'init','--bare',str(remote));git(root,'clone',str(remote),str(local))
 for repo in [local]:
  git(repo,'config','user.email','test@example.org');git(repo,'config','user.name','Test')
 git(local,'checkout','-b','main');(local/'rates.json').write_text('initial');git(local,'add','.');git(local,'commit','-m','initial');git(local,'push','origin','main')
 git(root,'clone','--branch','main',str(remote),str(other));git(other,'config','user.email','test@example.org');git(other,'config','user.name','Test')
 (local/'rates.json').write_text('paid result');git(local,'add','.');git(local,'commit','-m','result')
 (other/'index.html').write_text('concurrent user change');git(other,'add','.');git(other,'commit','-m','user change');git(other,'push','origin','main')
 publish.push_changes(local,'main')
 assert(local/'rates.json').read_text()=='paid result'
 assert(local/'index.html').read_text()=='concurrent user change'
 assert git(local,'rev-parse','HEAD').strip()==git(local,'rev-parse','origin/main').strip()
 # A true data conflict must stop without losing the committed fetched result.
 git(other,'pull','--rebase','origin','main')
 (local/'rates.json').write_text('second paid result');git(local,'add','.');git(local,'commit','-m','second result')
 (other/'rates.json').write_text('owner edited same data');git(other,'add','.');git(other,'commit','-m','concurrent data edit');git(other,'push','origin','main')
 try:publish.push_changes(local,'main')
 except RuntimeError:pass
 else:raise AssertionError('Data conflict must not force overwrite')
 assert(local/'rates.json').read_text()=='second paid result'
print('PASS: concurrent git push is rebased while retaining both the paid snapshot and user code; no provider call is involved.')
