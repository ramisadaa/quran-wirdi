"""Static checks, module syntax, offline allowlist, currency isolation and source integrity."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import ast
import hashlib
import json
import re
import subprocess
import tempfile
import yaml

root=Path(__file__).resolve().parents[1]
class Markup(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.paths=[];self.scripts=[];self.summaries=[];self.csp=''
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'):self.ids.append(a['id'])
        if tag=='summary':self.summaries.append(a)
        if tag=='meta' and a.get('http-equiv')=='Content-Security-Policy':self.csp=a['content']
        if tag=='script':
            assert a.get('src'),'No inline scripts allowed'
            self.scripts.append(a['src'])
        for key in ['src','href']:
            value=a.get(key,'')
            if value and not value.startswith(('#','http:','https:','data:','mailto:')):self.paths.append(value)
m=Markup();m.feed((root/'index.html').read_text());assert len(m.ids)==len(set(m.ids))
for path in m.paths:assert(root/urlsplit(path).path).is_file(),path
assert "script-src 'self'"in m.csp and 'api.aladhan.com'not in m.csp
assert all('aria-label'not in summary for summary in m.summaries)
for path in list(root.glob('*.js'))+list((root/'js').glob('*.js'))+list((root/'tests').glob('*.cjs')):
    result=subprocess.run(['node','--check',str(path)],capture_output=True,text=True);assert result.returncode==0,(path,result.stderr)
for path in root.rglob('*.py'):ast.parse(path.read_text())
for path in(root/'data').glob('*.json'):json.loads(path.read_text())
manifest=json.loads((root/'manifest.webmanifest').read_text());assert manifest['scope']=='./'
for icon in manifest['icons']:assert(root/icon['src']).is_file()
for path in(root/'css').glob('*.css'):
    text=path.read_text()
    for target in re.findall(r"url\(['\"]?([^)'\"]+)",text):
        if not target.startswith('data:'):assert(path.parent/target).resolve().is_file(),target
    assert not re.search(r'font-size:\s*(?:9|10|11|12)px',text)
for path in(root/'js').glob('*.js'):
    text=path.read_text()
    assert 'innerHTML'not in text and 'eval('not in text
    if path.name!='app-core.js':assert 'localStorage.'not in text,path
currency=(root/'js/currency.js').read_text();assert 'api.exchangerate.host'not in currency and 'access_key'not in currency
assert 'currency-api@${date}'in currency
assert 'api.aladhan.com'not in(root/'js/prayers.js').read_text()
assert hashlib.sha256((root/'assets/vendor/adhan-4.4.6.min.js').read_bytes()).hexdigest()=='ae8fb2565d36539e29bfc159396039f5e90d1fd7abf52b91fba48462d424daf3'
for path in(root/'.github/workflows').glob('*.yml'):
    workflow=yaml.load(path.read_text(),Loader=yaml.BaseLoader)
    assert not workflow.get('permissions'),path
    for job in workflow['jobs'].values():
        for step in job.get('steps',[]):
            if 'uses'in step:assert re.fullmatch(r'actions/[a-z-]+@[0-9a-f]{40}',step['uses']),step['uses']
assert len(json.loads((root/'data/duas.json').read_text()))>=15
with tempfile.TemporaryDirectory()as tmp:
    output=Path(tmp)/'public';subprocess.run(['python3',str(root/'tools/build_site.py'),'--output',str(output)],check=True,capture_output=True)
    assert not(output/'tools').exists()and not(output/'.github').exists()
    assert {p.name for p in(output/'data').iterdir()}=={'duas.json','exchange-rates.json'}
    shell=(output/'sw.js').read_text();assert './assets/vendor/adhan-4.4.6.min.js'in shell and './fonts/Cairo.woff2'in shell
print('PASS: static/module syntax, CSP, assets/fonts, IDs, storage isolation, pinned vendor/actions, dual currency paths, 15 duas, PWA build and public exclusions.')
