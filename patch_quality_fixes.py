from pathlib import Path
import re

p=Path('index.html')
s=p.read_text()
s=s.replace('<script src="notification_status.js?v=1"></script>','<script src="notification_status.js?v=2"></script>')
s=s.replace('<script src="app_update.js?v=1"></script>','<script src="app_update.js?v=4"></script>')
s=s.replace('<script src="app_update.js?v=2"></script>','<script src="app_update.js?v=4"></script>')
s=s.replace('<script src="app_update.js?v=3"></script>','<script src="app_update.js?v=4"></script>')
s=s.replace('<script src="quality_fixes.js?v=1"></script>','<script src="quality_fixes.js?v=2"></script>')
tag='<script src="quality_fixes.js?v=2"></script>'
if not re.search(r'<script\s+src="quality_fixes\.js(?:\?[^"]*)?"', s):
    # Keep newer installed versions and load any missing module before the layout.
    anchor='<script src="redesign.js?v=1"></script>'
    if anchor in s:
        s=s.replace(anchor,tag+'\n'+anchor,1)
    else:
        s=s.replace('</body>',tag+'\n</body>',1)
p.write_text(s)
