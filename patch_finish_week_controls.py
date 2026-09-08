from pathlib import Path
import re

p=Path('index.html')
s=p.read_text()
anchor='<script src="path_to_win.js?v=1"></script>'
tag='<script src="finish_week_controls.js?v=1"></script>'
if tag not in s:
    if anchor not in s:
        raise SystemExit('path_to_win anchor missing')
    s=s.replace(anchor,anchor+'\n'+tag,1)
s=re.sub(r'<script src="app_update\.js\?v=\d+"></script>','<script src="app_update.js?v=9"></script>',s,count=1)
p.write_text(s)

p=Path('app_update.js')
s=p.read_text()
s=re.sub(r"const BUILD_VERSION = '[^']+';","const BUILD_VERSION = '2026.09.08.1';",s,count=1)
p.write_text(s)
Path('app-version.json').write_text('{"version":"2026.09.08.1"}\n')
