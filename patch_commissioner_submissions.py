from pathlib import Path

p = Path('index.html')
s = p.read_text()

old = "let subs=[],slots=[];if(week)try{subs=await db('submissions?week_id=eq.'+week.id+'&select=user_id');}catch{}try{slots=await db('player_slots?select=slot,display_name,username,claimed_by&order=slot.asc');}catch{}"
new = "let subs=[],slots=[],profiles=[];if(week)try{subs=await db('submissions?week_id=eq.'+week.id+'&select=user_id,submitted_at');}catch{}try{slots=await db('player_slots?select=slot,display_name,username,claimed_by&order=slot.asc');}catch{}try{profiles=await db('profiles?select=id,display_name,role');}catch{}"
if old not in s:
    raise SystemExit('commissioner data block not found')
s = s.replace(old, new, 1)

marker = "h+='<div class=\"card\"><h2>Player Accounts</h2>"
if marker not in s:
    raise SystemExit('player accounts marker not found')

insert = """if(week){const submittedMap=new Map(subs.map(s=>[s.user_id,s.submitted_at]));const people=[];const commissioner=profiles.find(p=>p.role==='commissioner');if(commissioner)people.push({id:commissioner.id,name:commissioner.display_name||'Commissioner',active:true});for(const s of slots){const claimed=s.claimed_by?profiles.find(p=>p.id===s.claimed_by):null;people.push({id:s.claimed_by||null,name:(claimed&&claimed.display_name)||s.display_name||('Player '+s.slot),active:!!s.claimed_by});}h+='<div class=\"card\"><h2>Submission Status</h2><p class=\"muted\"><b>'+subs.length+'/8 submitted</b></p>'+people.slice(0,8).map(p=>{const when=p.id&&submittedMap.get(p.id);const status=when?'<span class=\"pill good\">✓ Submitted</span>':p.active?'<span class=\"pill wait\">Not submitted</span>':'<span class=\"pill wait\">Not activated</span>';const detail=when?'<div class=\"mini\">'+esc(new Date(when).toLocaleString())+'</div>':'';return '<div class=\"row\" style=\"padding:10px 0;border-bottom:1px solid var(--line)\"><div><b>'+esc(p.name)+'</b>'+detail+'</div>'+status+'</div>';}).join('')+'</div>';}
"""
s = s.replace(marker, insert + marker, 1)
p.write_text(s)
