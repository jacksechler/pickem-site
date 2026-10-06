// Standalone shareable League Picks grid.
// This page is intentionally independent from the full League Picks matrix so it remains
// easy to screenshot, copy, or send to the group chat.
(() => {
  const $ = id => document.getElementById(id);
  let shareWeekId = null;
  let rendering = false;

  function escShare(v){
    return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

  async function profiles(){
    return db('profiles?select=id,display_name,username&order=display_name.asc');
  }

  async function availableShareWeeks(){
    const rows = await db('weeks?select=*&order=number.desc');
    return rows.filter(w =>
      w.status === 'published' ||
      (w.is_active && (Date.now() >= new Date(w.lock_at).getTime() || !!w.auto_locked_at))
    );
  }

  async function loadShareBundle(id){
    const [wr,ps,qs,subs,picks] = await Promise.all([
      db('weeks?id=eq.'+id+'&select=*&limit=1'),
      profiles(),
      db('questions?week_id=eq.'+id+'&select=*&order=position.asc'),
      db('submissions?week_id=eq.'+id+'&select=user_id,tiebreaker_answer'),
      db('picks?week_id=eq.'+id+'&select=user_id,question_id,answer')
    ]);
    const w=wr[0];
    if(!w) throw new Error('That week could not be found.');
    const pmap=Object.fromEntries(ps.map(p=>[p.id,p]));
    const users=subs
      .map(s=>s.user_id)
      .filter(id=>pmap[id])
      .sort((a,b)=>String(pmap[a]?.display_name||pmap[a]?.username||'')
        .localeCompare(String(pmap[b]?.display_name||pmap[b]?.username||'')))
      .slice(0,8);
    const subMap=Object.fromEntries(subs.map(s=>[s.user_id,s]));
    const pickMap={};
    picks.forEach(p => { (pickMap[p.user_id]??={})[p.question_id]=p.answer; });
    return {week:w,profiles:ps,pmap,questions:qs,users,pickMap,subMap};
  }

  function firstName(p){
    return String(p?.display_name||p?.username||'Player').trim().split(/\s+/)[0] || 'Player';
  }

  function compactValue(v){
    if(v === null || v === undefined || v === '') return '—';
    if(typeof v === 'string') return v.length > 13 ? v.slice(0,12)+'…' : v;
    const s=JSON.stringify(v);
    return s.length > 13 ? s.slice(0,12)+'…' : s;
  }

  function gridText(d){
    const lines=[];
    lines.push((d.week?.name||'Pick’em Week')+' Picks');
    lines.push(['Question',...d.users.map(id=>firstName(d.pmap[id]))].join(' | '));
    d.questions.filter(q=>q.counts_for_score!==false).forEach((q,i)=>{
      lines.push(['Q'+(i+1),...d.users.map(id=>compactValue(d.pickMap[id]?.[q.id]))].join(' | '));
    });
    lines.push(['TB',...d.users.map(id=>compactValue(d.subMap?.[id]?.tiebreaker_answer))].join(' | '));
    return lines.join('\n');
  }

  function renderGrid(d){
    const users=d.users;
    if(!users.length) return '<div class="card muted">No submitted picks for this week.</div>';
    const qs=d.questions.filter(q=>q.counts_for_score!==false)
      .sort((a,b)=>Number(a.position||0)-Number(b.position||0));

    let h='<div id="shareGridCard" class="share-grid-card card">';
    h+='<div class="share-grid-head"><div><div class="eyebrow">SHARE GRID</div><h2>'+escShare(d.week?.name||'Pick’em Week')+' Picks</h2></div><div class="share-grid-count">'+users.length+'/8 players</div></div>';
    h+='<div class="share-grid-scroll"><table class="share-grid"><thead><tr><th>Q</th>';
    users.forEach(id=>h+='<th>'+escShare(firstName(d.pmap[id]))+'</th>');
    h+='</tr></thead><tbody>';

    qs.forEach((q,i)=>{
      h+='<tr><th>Q'+(i+1)+'</th>';
      users.forEach(id=>{
        const v=d.pickMap[id]?.[q.id];
        const decided=q.result!==null && q.result!==undefined;
        const correct=decided && same(v,q.result);
        const cls=decided ? (correct?'right':'wrong') : '';
        h+='<td class="'+cls+'" title="'+escShare(String(v??'—'))+'">'+escShare(compactValue(v))+'</td>';
      });
      h+='</tr>';
    });

    h+='<tr class="tb"><th>TB</th>';
    users.forEach(id=>h+='<td>'+escShare(compactValue(d.subMap?.[id]?.tiebreaker_answer))+'</td>');
    h+='</tr></tbody></table></div>';
    h+='<div class="share-grid-legend"><span>✓ Correct</span><span>✕ Wrong</span><span>Neutral = undecided</span></div>';
    h+='</div>';
    return h;
  }

  async function renderShare(){
    const box=$('shareGridBox');
    if(!box || rendering) return;
    rendering=true;
    box.innerHTML='<div class="card muted">Loading share grid…</div>';

    try{
      const weeks=await availableShareWeeks();
      const activeId=week?.id;

      if(!shareWeekId || !weeks.some(w=>w.id===shareWeekId)){
        shareWeekId=activeId && weeks.some(w=>w.id===activeId)
          ? activeId
          : (weeks[0]?.id||null);
      }

      if(!shareWeekId){
        box.innerHTML='<div class="card muted"><b>No shareable week yet.</b><div class="mini">The Share Grid becomes available after a week locks.</div></div>';
        return;
      }

      const d=await loadShareBundle(shareWeekId);
      let h='';
      h+='<div class="card share-toolbar"><div><div class="eyebrow">SHARE</div><h2 style="margin:4px 0">Shareable Picks Grid</h2><div class="muted">A compact version made for screenshots and sending to the group chat.</div></div>';
      h+='<div class="share-toolbar-actions"><label style="margin:0;min-width:190px"><span class="mini">Week</span><select id="shareWeekSelect">'+weeks.map(w=>'<option value="'+w.id+'" '+(w.id===shareWeekId?'selected':'')+'>'+escShare(w.name||('Week '+w.number))+'</option>').join('')+'</select></label><button class="btn secondary" id="shareGridCopy">Copy grid</button><button class="btn" id="shareGridShare">Share</button></div></div>';
      h+=renderGrid(d);
      h+='<div class="card muted">Take a screenshot of the grid above, or use <b>Share</b> to send the week to another app. <b>Copy grid</b> copies a text version.</div>';

      box.innerHTML=h;
      $('shareWeekSelect')?.addEventListener('change',async e=>{
        shareWeekId=e.target.value;
        await renderShare();
      });

      const textValue=gridText(d);
      $('shareGridCopy')?.addEventListener('click',async ()=>{
        try{
          await navigator.clipboard.writeText(textValue);
          $('shareGridCopy').textContent='Copied!';
          setTimeout(()=>{if($('shareGridCopy'))$('shareGridCopy').textContent='Copy grid';},1200);
        }catch{ alert(textValue); }
      });

      $('shareGridShare')?.addEventListener('click',async ()=>{
        const data={
          title:(d.week?.name||'Pick’em')+' Picks',
          text:'Check out our '+(d.week?.name||'Pick’em')+' picks:\n\n'+textValue,
          url:location.href
        };
        try{
          if(navigator.share) await navigator.share(data);
          else {
            await navigator.clipboard.writeText(data.text+'\n\n'+data.url);
            $('shareGridShare').textContent='Copied!';
            setTimeout(()=>{if($('shareGridShare'))$('shareGridShare').textContent='Share';},1200);
          }
        }catch{}
      });
    }catch(e){
      console.error('Share Grid',e);
      box.innerHTML='<div class="notice"><b>Could not load the Share Grid.</b><div class="mini">Check your connection, then try again.</div><button id="shareGridRetry" class="btn secondary" style="margin-top:10px">Retry</button></div>';
      $('shareGridRetry')?.addEventListener('click',renderShare);
    }finally{
      rendering=false;
    }
  }

  function ensureSharePage(){
    const main=document.querySelector('main.wrap');
    if(!main) return;

    if(!$('sharegrid')){
      main.insertAdjacentHTML('beforeend',
        '<section id="sharegrid" class="page hidden" aria-labelledby="shareGridTitle"><div class="hero"><div><div class="eyebrow">SHARE WITH THE LEAGUE</div><h1 id="shareGridTitle">Share Grid</h1><div class="muted">The compact screenshot-friendly picks board.</div></div></div><div id="shareGridBox"></div></section>'
      );
    }

    const nav=document.querySelector('nav');
    if(nav && !nav.querySelector('[data-page="sharegrid"]')){
      const b=document.createElement('button');
      b.className='navbtn';
      b.dataset.page='sharegrid';
      b.textContent='Share Grid';
      b.onclick=()=>showPage('sharegrid',b);
      const morePanel=$('secondaryNavigation');
      const moreButton=$('moreNav');
      if(moreButton) nav.insertBefore(b,moreButton);
      else if(morePanel) nav.insertBefore(b,morePanel);
      else nav.appendChild(b);
    }
  }

  window.renderShareGrid=renderShare;

  // Render the standalone Share Grid when the user navigates to its page.
  // The core showPage() function only changes visibility; without this hook the
  // page opens to an empty shareGridBox because the renderer runs only at load time.
  const originalShowPage=window.showPage;
  if(typeof originalShowPage==='function'){
    window.showPage=function(id,btn){
      const result=originalShowPage.apply(this,arguments);
      if(id==='sharegrid') requestAnimationFrame(() => renderShare());
      return result;
    };
  }
  window.ShareGridTestHooks={compactValue,gridText,renderGrid};

  ensureSharePage();
  if(document.querySelector('#sharegrid:not(.hidden)')) renderShare();
})();
