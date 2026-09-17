from pathlib import Path
import json

INDEX = Path('index.html')
APP_UPDATE = Path('app_update.js')
APP_VERSION = Path('app-version.json')
VERSION = '2026.09.17.1'

text = INDEX.read_text()
script = '<script src="post_lock_override.js?v=1"></script>'
if script not in text:
    text = text.replace('</body>', script + '\n</body>')
INDEX.write_text(text)

update = APP_UPDATE.read_text()
import re
update, n = re.subn(r"const BUILD_VERSION = '[^']+';", f"const BUILD_VERSION = '{VERSION}';", update, count=1)
if n != 1:
    raise SystemExit('Could not update BUILD_VERSION')
APP_UPDATE.write_text(update)

APP_VERSION.write_text(json.dumps({'version': VERSION}, separators=(',', ':')) + '\n')
