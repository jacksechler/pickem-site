from pathlib import Path
import re

p=Path('index.html')
s=p.read_text()
# Load after copy_standings so this wraps the final League renderer.
tag='<script src="path_to_win.js?v=1"></script>'
anchor='<script src="copy_standings.js?v=2"></script>'
if tag not in s:
    if anchor not in s:
        raise SystemExit('copy standings anchor missing')
    s=s.replace(anchor,anchor+'\n'+tag,1)
s=re.sub(r'<script src="app_update\.js\?v=\d+"></script>','<script src="app_update.js?v=8"></script>',s,count=1)
p.write_text(s)

p=Path('app_update.js')
s=p.read_text()
s=re.sub(r"const BUILD_VERSION = '[^']+';","const BUILD_VERSION = '2026.09.06.3';",s,count=1)
p.write_text(s)

Path('app-version.json').write_text('{"version":"2026.09.06.3"}\n')
