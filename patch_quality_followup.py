from pathlib import Path

# Update checker: remove both temporary query parameters after a successful reload.
p=Path('app_update.js')
s=p.read_text()
old="""      u.searchParams.delete('appv');
      history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);"""
new="""      u.searchParams.delete('appv');
      u.searchParams.delete('_refresh');
      history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);"""
if old not in s:
    raise SystemExit('app update cleanup anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Mobile summary cards: use Week as the title for player logs and Player as the title for final-week results.
p=Path('quality_fixes.js')
s=p.read_text()
old="""      const title=cells[1]||cells[0]||'Result';
      const fields=cells.map((v,i)=>({label:headers[i]||'',value:v})).filter((x,i)=>x.value&&i!==1&&x.label);"""
new="""      const primaryIndex=headers[0]==='Week'?0:(headers[1]==='Player'?1:(cells[1]?1:0));
      const title=cells[primaryIndex]||cells[0]||'Result';
      const fields=cells.map((v,i)=>({label:headers[i]||'',value:v})).filter((x,i)=>x.value&&i!==primaryIndex&&x.label);"""
if old not in s:
    raise SystemExit('mobile card anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
