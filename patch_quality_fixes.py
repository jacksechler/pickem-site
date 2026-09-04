from pathlib import Path

p=Path('index.html')
s=p.read_text()
s=s.replace('<script src="notification_status.js?v=1"></script>','<script src="notification_status.js?v=2"></script>')
s=s.replace('<script src="app_update.js?v=1"></script>','<script src="app_update.js?v=4"></script>')
s=s.replace('<script src="app_update.js?v=2"></script>','<script src="app_update.js?v=4"></script>')
s=s.replace('<script src="app_update.js?v=3"></script>','<script src="app_update.js?v=4"></script>')
s=s.replace('<script src="quality_fixes.js?v=1"></script>','<script src="quality_fixes.js?v=2"></script>')
tag='<script src="quality_fixes.js?v=2"></script>'
anchor='<script src="mobile_header_fix.js?v=1"></script>'
if tag not in s:
    if anchor not in s:
        raise SystemExit('mobile header anchor missing')
    s=s.replace(anchor,anchor+'\n'+tag)
p.write_text(s)
