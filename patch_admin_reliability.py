from pathlib import Path

# Load the new admin/reliability scripts and make service-worker updates bypass HTTP cache.
idx = Path('index.html')
s = idx.read_text()

s = s.replace('<script src="notifications.js?v=1"></script>', '<script src="notifications.js?v=2"></script>')
needle = '<script src="mobile_header_fix.js?v=1"></script>'
extras = '<script src="commissioner_admin_tools.js?v=1"></script>\n<script src="app_update.js?v=1"></script>\n'
if '<script src="commissioner_admin_tools.js?v=1"></script>' not in s:
    if needle in s:
        s = s.replace(needle, extras + needle)
    else:
        s = s.replace('</body>', extras + '</body>')
idx.write_text(s)

p = Path('notifications.js')
n = p.read_text()
old = "  async function getRegistration(){\n    return await navigator.serviceWorker.register('./sw.js',{scope:'./'});\n  }"
new = "  async function getRegistration(){\n    const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});\n    try{ await reg.update(); }catch{}\n    return reg;\n  }"
if old in n:
    n = n.replace(old, new)
p.write_text(n)
