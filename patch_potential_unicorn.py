from pathlib import Path

p=Path('index.html')
s=p.read_text()
needle='<script src="mobile_grid_fix.js?v=3"></script>'
if needle not in s:
    needle='<script src="mobile_grid_fix.js?v=2"></script>'
old='<script src="potential_unicorn.js?v=1"></script>'
script='<script src="potential_unicorn.js?v=2"></script>'
if old in s:
    s=s.replace(old,script)
elif script not in s:
    if needle in s:
        s=s.replace(needle, needle+'\n'+script)
    else:
        s=s.replace('</body>', script+'\n</body>')
p.write_text(s)
