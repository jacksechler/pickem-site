from pathlib import Path

p=Path('index.html')
s=p.read_text()
tag='<script src="features_v3.js?v=1"></script>'
if tag not in s:
    anchor='<script src="notifications.js?v=1"></script>'
    if anchor in s:
        s=s.replace(anchor, anchor+'\n'+tag)
    else:
        s=s.replace('</body>', tag+'\n</body>')
p.write_text(s)
