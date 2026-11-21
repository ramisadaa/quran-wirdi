"""Anchor reservations to the original run, including re-runs; never log tokens."""
from datetime import datetime
import json
import os
from urllib.request import Request, urlopen

try:
    request = Request(f'https://api.github.com/repos/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
                      headers={'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
    with urlopen(request, timeout=20) as response:
        created = json.load(response)['created_at']
    created = datetime.fromisoformat(created.replace('Z', '+00:00')).isoformat()
    with open(os.environ['GITHUB_ENV'], 'a') as output:
        output.write('WORKFLOW_CREATED_AT=' + created + '\n')
except Exception:
    raise SystemExit('Unable to determine original workflow time. No provider request is allowed.') from None
