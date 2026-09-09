from pathlib import Path
import re

# One-time installer: preserve newer module URLs, wrapper order, and build versions.
if re.search(r'<script\s+src="copy_standings\.js(?:\?[^"]*)?"', Path('index.html').read_text()):
    print('copy_standings.js is already installed; keeping this release.')
    raise SystemExit(0)

from pathlib import Path
import re

# Load the copy helper last so it wraps the final League/Standings renderers.
p=Path('index.html')
s=p.read_text()
s=re.sub(r'<script src="copy_standings\.js\?v=\d+"></script>','<script src="copy_standings.js?v=2"></script>',s,count=1)
anchor='<script src="weekly_standings_v2.js?v=1"></script>'
tag='<script src="copy_standings.js?v=2"></script>'
if tag not in s:
    if anchor not in s:
        raise SystemExit('weekly standings anchor missing')
    s=s.replace(anchor,anchor+'\n'+tag,1)
s=re.sub(r'<script src="app_update\.js\?v=\d+"></script>','<script src="app_update.js?v=7"></script>',s,count=1)
p.write_text(s)

# Bump the app build so phones receive the fixed clipboard helper exactly once.
p=Path('app_update.js')
s=p.read_text()
s=re.sub(r"const BUILD_VERSION = '[^']+';","const BUILD_VERSION = '2026.09.06.2';",s,count=1)
p.write_text(s)

Path('app-version.json').write_text('{"version":"2026.09.06.2"}\n')
