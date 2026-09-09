from pathlib import Path
import re

# One-time installer: preserve newer module URLs, wrapper order, and build versions.
if re.search(r'<script\s+src="archived_week_editor\.js(?:\?[^"]*)?"', Path('index.html').read_text()):
    print('archived_week_editor.js is already installed; keeping this release.')
    raise SystemExit(0)

from pathlib import Path

p = Path('index.html')
s = p.read_text()
tag = '<script src="archived_week_editor.js?v=1"></script>'
anchor = '<script src="commissioner_admin_tools.js?v=1"></script>'
if tag not in s:
    if anchor not in s:
        raise SystemExit('commissioner admin tools anchor not found')
    s = s.replace(anchor, anchor + '\n' + tag)
    p.write_text(s)
    print('Installed archived week editor')
else:
    print('Archived week editor already installed')
