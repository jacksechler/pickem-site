from pathlib import Path
import re

# One-time installer: preserve newer module URLs, wrapper order, and build versions.
if re.search(r'<script\s+src="potential_unicorn\.js(?:\?[^"]*)?"', Path('index.html').read_text()):
    print('potential_unicorn.js is already installed; keeping this release.')
    raise SystemExit(0)

from pathlib import Path

p=Path('index.html')
s=p.read_text()
needle='<script src="mobile_grid_fix.js?v=3"></script>'
if needle not in s:
    needle='<script src="mobile_grid_fix.js?v=2"></script>'
old='<script src="potential_unicorn.js?v=1"></script>'
script='<script src="potential_unicorn.js?v=2"></script>'
if old in s:
    s=s.replace(old,script)
elif script not in s:
    if needle in s:
        s=s.replace(needle, needle+'\n'+script)
    else:
        s=s.replace('</body>', script+'\n</body>')
p.write_text(s)
