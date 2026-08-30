from pathlib import Path
p=Path('index.html')
s=p.read_text()
tag='<script src="stats_v2.js"></script>'
if tag not in s:
    s=s.replace('<script src="commissioner_v2.js"></script>', '<script src="commissioner_v2.js"></script>\n'+tag)
    p.write_text(s)
