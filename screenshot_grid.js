// Compact iPhone-friendly screenshot grid for League Picks.
(() => {
  const baseRenderLeague = window.renderLeague;
  const sameAnswer = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const isDecided = q => q.result !== null && q.result !== undefined;

  const knownFirstNames = {
    jacksechler:'Jack',
    cadechristy:'Cade',
    brodyravenstahl:'Brody',
    chasecarulli:'Chase',
    evanlewis:'Evan',
    jacksongraham:'Jackson',
    klayfunovits:'Klay',
    lincolnconstant:'Lincoln'
  };

  function firstName(profile){
    const username=String(profile?.username||'').toLowerCase();
    if(knownFirstNames[username]) return knownFirstNames[username];
    const name=String(profile?.display_name||profile?.username||'Player').trim();
    return name.split(/\s+/)[0] || 'Player';
  }

  async function screenshotGridHtml(){
    if(!week || !locked()) return '';
    const [profiles,subs,picks]=await Promise.all([
      db('profiles?select=id,display_name,username'),
      db('submissions?week_id=eq.'+week.id+'&select=user_id'),
      db('picks?week_id=eq.'+week.id+'&select=user_id,question_id,answer')
    ]);
    const profileMap=Object.fromEntries(profiles.map(p=>[p.id,p]));
    const users=subs.map(s=>s.user_id).slice(0,8);
    if(!users.length) return '';
    const pickMap={};
    picks.forEach(p=>{(pickMap[p.user_id]??={})[p.question_id]=p.answer;});
    const qs=[...questions].filter(q=>q.counts_for_score!==false).sort((a,b)=>Number(a.position||0)-Number(b.position||0));

    let h='<div class="card" id="screenshotGridCard" style="padding:12px;overflow:hidden">';
    h+='<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-bottom:9px"><div><div class="eyebrow">SCREENSHOT GRID</div><div style="font-size:17px;font-weight:950;margin-top:2px">'+esc(week.name)+' Live Picks</div></div><div class="mini" style="text-align:right">Top → bottom = Q1 → Q'+qs.length+'</div></div>';
    h+='<div style="display:grid;grid-template-columns:repeat('+users.length+',minmax(0,1fr));gap:3px;width:100%">';
    users.forEach(id=>{
      const name=firstName(profileMap[id]);
      const size=name.length>=7?'7.5':name.length>=6?'8.5':'9.5';
      h+='<div title="'+esc(profileMap[id]?.display_name||profileMap[id]?.username||'Player')+'" style="text-align:center;font-size:'+size+'px;font-weight:950;padding:4px 0 5px;white-space:nowrap;overflow:hidden;text-overflow:clip">'+esc(name)+'</div>';
    });
    qs.forEach(q=>{
      users.forEach(id=>{
        const a=pickMap[id]?.[q.id];
        let bg='#223247',border='#304965',symbol='';
        if(isDecided(q)){
          const ok=sameAnswer(a,q.result);
          bg=ok?'#0f513f':'#5a1f2b';
          border=ok?'#2f9f7b':'#b94a61';
          symbol=ok?'✓':'×';
        }
        h+='<div title="'+esc(profileMap[id]?.display_name||'Player')+' · Q'+Number(q.position||0)+'" style="height:19px;border-radius:5px;background:'+bg+';border:1px solid '+border+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:950;color:#fff;line-height:1">'+symbol+'</div>';
      });
    });
    h+='</div><div class="mini" style="margin-top:8px;text-align:center">Green = right · Red = wrong · Gray = not decided</div></div>';
    return h;
  }

  window.renderLeague = async function(){
    await baseRenderLeague();
    const box=el('leagueBox');
    if(!box || !week || !locked()) return;
    const old=el('screenshotGridCard');
    if(old) old.remove();
    try{
      const html=await screenshotGridHtml();
      if(html) box.insertAdjacentHTML('beforeend',html);
    }catch(e){
      console.debug('Screenshot grid skipped',e);
    }
  };
})();
