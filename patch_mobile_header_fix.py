from pathlib import Path

p=Path('index.html')
s=p.read_text()
script='<script src="mobile_header_fix.js?v=1"></script>'
if script not in s:
    s=s.replace('</body>', script+'\n</body>')
p.write_text(s)
