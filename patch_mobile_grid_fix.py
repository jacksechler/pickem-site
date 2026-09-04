from pathlib import Path

p = Path('index.html')
s = p.read_text()
needle = '<script src="history_profiles.js?v=1"></script>'
script = '<script src="mobile_grid_fix.js?v=1"></script>'
if script not in s:
    if needle in s:
        s = s.replace(needle, needle + '\n' + script)
    else:
        s = s.replace('</body>', script + '\n</body>')
p.write_text(s)
