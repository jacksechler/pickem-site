from pathlib import Path
import re

# One-time installer: preserve newer module URLs, wrapper order, and build versions.
if re.search(r'<script\s+src="weekly_standings_v2\.js(?:\?[^"]*)?"', Path('index.html').read_text()):
    print('weekly_standings_v2.js is already installed; keeping this release.')
    raise SystemExit(0)

from pathlib import Path
import re

VERSION='2026.09.04.7'

p=Path('index.html')
s=p.read_text()
# Force the newest update checker and load weekly standings last so it can
# enhance the final League renderer from all earlier feature scripts.
s=re.sub(r'<script src="app_update\.js\?v=\d+"></script>', '<script src="app_update.js?v=5"></script>', s)
tag='<script src="weekly_standings_v2.js?v=1"></script>'
if tag not in s:
    s=s.replace('</body>', tag+'\n</body>')
p.write_text(s)

u=Path('app_update.js')
us=u.read_text()
us=re.sub(r"const BUILD_VERSION = '[^']+';", f"const BUILD_VERSION = '{VERSION}';", us, count=1)
u.write_text(us)

Path('app-version.json').write_text('{"version":"'+VERSION+'"}\n')
