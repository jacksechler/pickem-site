from pathlib import Path

# Installs/cache-busts the iPhone grid usability fix after the history/profile script.
p = Path('index.html')
s = p.read_text()
needle = '<script src="history_profiles.js?v=1"></script>'
old = '<script src="mobile_grid_fix.js?v=1"></script>'
script = '<script src="mobile_grid_fix.js?v=2"></script>'
if old in s:
    s = s.replace(old, script)
elif script not in s:
    if needle in s:
        s = s.replace(needle, needle + '\n' + script)
    else:
        s = s.replace('</body>', script + '\n</body>')
p.write_text(s)
