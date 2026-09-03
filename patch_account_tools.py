from pathlib import Path

p=Path('index.html')
s=p.read_text()
s=s.replace('placeholder="Example: Luca Cinalli"','placeholder="firstnamelastname"')
if 'account_tools.js' not in s:
    s=s.replace('</body>','<script src="account_tools.js?v=1"></script>\n</body>')
p.write_text(s)
