"""Rebase committed result onto concurrent code pushes without another API call."""
from pathlib import Path
import os
import subprocess


def command(root, *args):
    return subprocess.run(['git', *args], cwd=root, capture_output=True, text=True)


def push_changes(root, branch):
    if command(root, 'check-ref-format', '--branch', branch).returncode:
        raise RuntimeError('Invalid default branch.')
    for _ in range(3):
        if command(root, 'push', 'origin', 'HEAD:refs/heads/' + branch).returncode == 0:
            return
        if command(root, 'fetch', 'origin', branch).returncode:
            continue
        if command(root, 'rebase', 'FETCH_HEAD').returncode:
            command(root, 'rebase', '--abort')
            raise RuntimeError('Concurrent changes conflict. Preserve the result artifact; do not fetch the provider again.')
    raise RuntimeError('Unable to push result after three attempts. The result artifact preserves the fetched data.')


if __name__ == '__main__':
    try:
        push_changes(Path(__file__).resolve().parents[1], os.environ['DEFAULT_BRANCH'])
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
