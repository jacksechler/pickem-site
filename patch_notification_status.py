from pathlib import Path
p=Path('index.html')
s=p.read_text()
tag='<script src="notification_status.js?v=1"></script>'
if tag not in s:
    s=s.replace('</body>',tag+'\n</body>')
p.write_text(s)
# installer trigger
