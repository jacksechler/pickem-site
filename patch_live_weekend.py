from pathlib import Path

# Load the new live weekend script after the existing app upgrades.
idx = Path('index.html')
html = idx.read_text()
if 'live_weekend.js' not in html:
    html = html.replace('<script src="account_tools.js?v=1"></script>', '<script src="account_tools.js?v=1"></script>\n<script src="live_weekend.js?v=1"></script>')
idx.write_text(html)

# Make the perfect-week opening streak follow the order results were entered.
p = Path('commissioner_v2.js')
s = p.read_text()
marker = '  async function buildScoreData(){'
start = s.index(marker)
needle = '    const scored=questions.filter(q=>q.counts_for_score!==false);'
pos = s.index(needle, start)
replacement = '''    const scored=questions.filter(q=>q.counts_for_score!==false).sort((a,b)=>{\n      const ao=a.result_order==null?999999:Number(a.result_order);\n      const bo=b.result_order==null?999999:Number(b.result_order);\n      return ao-bo || Number(a.position||0)-Number(b.position||0);\n    });'''
s = s[:pos] + replacement + s[pos+len(needle):]
p.write_text(s)
