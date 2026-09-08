// Late-week "Path to the Win" scenario calculator for League Picks.
(() => {
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const decided=q=>q.result!==null&&q.result!==undefined;
  const firstName=p=>String(p?.display_name||p?.username||'Player').trim().split(/\s+/)[0]||'Player';
  const MAX_REMAINING=4;
  const MAX_SCENARIOS=128;

  function optionLabel(v){
    if(v===null||v===undefined) return '—';
    if(typeof v==='string'||typeof v==='number'||typeof v==='boolean') return String(v);
    if(typeof v==='object'){
      for(const k of ['label','name','team','display_name','displayName','shortName','abbreviation','value']){
        if(v[k]!==null&&v[k]!==undefined&&typeof v[k]!=='object') return String(v[k]);
      }
    }
    try{ return JSON.stringify(v); }catch{ return String(v); }
  }

  function shortPrompt(q){
    const s=String(q?.prompt||q?.sport||'Result').replace(/\s+/g,' ').trim();
    return s.length>42?s.slice(0,39)+'…':s;
  }

  function uniqOptions(q){
    const out=[];
    for(const v of (Array.isArray(q.answer_options)?q.answer_options:[])){
      if(!out.some(x=>same(x,v))) out.push(v);
    }
    return out;
  }

  function selectedWeekId(){
    return document.querySelector('#leagueBox select[onchange*="setLeagueHistoryWeek"]')?.value||week?.id||null;
  }

  async function loadPathData(id){
    const [wr,profiles,qs,subs,picks]=await Promise.all([
      db('weeks?id=eq.'+id+'&select=*&limit=1'),
      db('profiles?select=id,display_name,username'),
      db('questions?week_id=eq.'+id+'&select=*&order=position.asc'),
      db('submissions?week_id=eq.'+id+'&select=user_id,tiebreaker_answer'),
      db('picks?week_id=eq.'+id+'&select=user_id,question_id,answer')
    ]);
    const w=wr[0];
    const pmap=Object.fromEntries(profiles.map(p=>[p.id,p]));
    const subMap=Object.fromEntries(subs.map(s=>[s.user_id,s]));
    const pickMap={};
    picks.forEach(p=>{(pickMap[p.user_id]??={})[p.question_id]=p.answer;});
    const users=subs.map(s=>s.user_id).filter(id=>pmap[id]);
    const scored=qs.filter(q=>q.counts_for_score!==false);
    const done=scored.filter(decided);
    const remaining=scored.filter(q=>!decided(q));
    return {w,pmap,subMap,pickMap,users,scored,done,remaining};
  }

  function buildScenarios(remaining){
    let scenarios=[{}];
    for(const q of remaining){
      const opts=uniqOptions(q);
      if(!opts.length) return null;
      const next=[];
      for(const s of scenarios){
        for(const opt of opts){
          next.push({...s,[q.id]:opt});
          if(next.length>MAX_SCENARIOS) return null;
        }
      }
      scenarios=next;
    }
    return scenarios;
  }

  function tbDistance(sub,actual){
    const ans=sub?.tiebreaker_answer;
    const a=Number(ans), act=Number(actual);
    if(ans===null||ans===undefined||ans===''||!Number.isFinite(a)||!Number.isFinite(act)) return Infinity;
    return Math.abs(a-act);
  }

  function evaluate(d,scenarios){
    const actual=d.w?.tiebreaker_result;
    const hasActual=actual!==null&&actual!==undefined&&actual!==''&&Number.isFinite(Number(actual));
    const base={};
    d.users.forEach(id=>{
      base[id]=d.done.filter(q=>same(d.pickMap[id]?.[q.id],q.result)).length;
    });

    const results=scenarios.map(s=>{
      const totals={};
      d.users.forEach(id=>{
        let c=base[id];
        d.remaining.forEach(q=>{ if(same(d.pickMap[id]?.[q.id],s[q.id])) c++; });
        totals[id]=c;
      });
      const high=Math.max(...Object.values(totals));
      const top=d.users.filter(id=>totals[id]===high);
      if(top.length===1) return {scenario:s,totals,definite:[top[0]],unresolved:[]};
      if(hasActual){
        const ds=top.map(id=>[id,tbDistance(d.subMap[id],actual)]);
        const best=Math.min(...ds.map(x=>x[1]));
        const winners=ds.filter(x=>x[1]===best).map(x=>x[0]);
        return {scenario:s,totals,definite:winners,unresolved:[]};
      }
      return {scenario:s,totals,definite:[],unresolved:top};
    });
    return {results,base,hasActual,actual};
  }

  function pathLabel(s,remaining){
    return remaining.map(q=>'<b>'+esc(shortPrompt(q))+'</b>: '+esc(optionLabel(s[q.id]))).join(' · ');
  }

  function commonNeeds(opportunities,remaining){
    if(!opportunities.length) return [];
    const out=[];
    for(const q of remaining){
      const first=opportunities[0].scenario[q.id];
      if(opportunities.every(x=>same(x.scenario[q.id],first))){
        out.push({q,value:first});
      }
    }
    return out;
  }

  function playerCard(d,e,id){
    const wins=e.results.filter(r=>r.definite.includes(id));
    const ties=e.results.filter(r=>r.unresolved.includes(id));
    const opportunities=[...wins,...ties];
    const total=e.results.length;
    const current=e.base[id]||0;
    const name=firstName(d.pmap[id]);
    const needs=commonNeeds(opportunities,d.remaining);
    let badge='',badgeStyle='',headline='',detail='';

    if(wins.length===total && ties.length===0){
      badge='CLINCHED';
      badgeStyle='color:var(--green);border-color:#216e5a;background:#0b2a25';
      headline='No remaining result can knock '+esc(name)+' out of first.';
    }else if(!opportunities.length){
      badge='ELIMINATED';
      badgeStyle='color:var(--red);border-color:#7f1d1d;background:#2b1016';
      headline='No remaining combination puts '+esc(name)+' in first.';
    }else if(!wins.length && ties.length){
      badge=e.hasActual?'TIE STILL POSSIBLE':'NEEDS TIEBREAKER';
      badgeStyle='color:var(--gold);border-color:#665522;background:#29230b';
      headline=e.hasActual
        ? esc(name)+' can still finish tied after the entered tiebreaker.'
        : esc(name)+' can still reach a tie for first; the tiebreaker would decide it.';
    }else{
      badge='ALIVE';
      badgeStyle='color:var(--accent);border-color:#245271;background:#0d2535';
      headline=esc(name)+' has '+wins.length+' winning path'+(wins.length===1?'':'s')+(ties.length?' and '+ties.length+' tiebreaker path'+(ties.length===1?'':'s'):'')+'.';
    }

    if(opportunities.length && opportunities.length<total){
      if(needs.length){
        detail+='<div style="margin-top:8px"><b>Needs:</b> '+needs.map(x=>esc(shortPrompt(x.q))+': <b>'+esc(optionLabel(x.value))+'</b>').join(' · ')+'</div>';
      }else{
        detail+='<div style="margin-top:8px"><b>Multiple routes remain.</b> No single remaining result is required in every winning path.</div>';
      }
      const examples=opportunities.slice(0,2);
      if(examples.length){
        detail+='<div class="mini" style="margin-top:7px">'+examples.map((x,i)=>(i?'Another path: ':'Example path: ')+pathLabel(x.scenario,d.remaining)).join('<br>')+(opportunities.length>2?'<br>+'+(opportunities.length-2)+' more path'+(opportunities.length-2===1?'':'s'):'')+'</div>';
      }
    }

    return '<div style="border:1px solid var(--line);border-radius:13px;padding:13px;background:rgba(255,255,255,.015)">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'+
        '<div><b style="font-size:16px">'+esc(name)+'</b><div class="mini">'+current+'/'+d.done.length+' correct right now</div></div>'+
        '<span class="pill" style="'+badgeStyle+'">'+badge+'</span>'+
      '</div>'+
      '<div style="margin-top:8px">'+headline+'</div>'+detail+
    '</div>';
  }

  function screenHtml(d){
    if(!d.w||d.w.status==='published') return '';
    if(d.remaining.length<1||d.remaining.length>MAX_REMAINING) return '';
    const scenarios=buildScenarios(d.remaining);
    if(!scenarios||!scenarios.length) return '';
    const e=evaluate(d,scenarios);
    const order=[...d.users].sort((a,b)=>(e.base[b]||0)-(e.base[a]||0)||firstName(d.pmap[a]).localeCompare(firstName(d.pmap[b])));
    const tbNote=e.hasActual
      ? 'The entered tiebreaker result is included when a scenario ends tied.'
      : 'If a scenario ends tied for first, it is shown as a tiebreaker path until the actual tiebreaker is entered.';

    return '<div class="card" id="pathToWinCard" style="margin-top:12px">'+
      '<div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">'+
        '<div><div class="eyebrow">LATE-WEEK SCENARIOS</div><h2 style="margin:4px 0">Path to the Win</h2><div class="muted">Who needs what with '+d.remaining.length+' scored result'+(d.remaining.length===1?'':'s')+' left. '+tbNote+'</div></div>'+
        '<div class="pill">'+d.remaining.length+' left · '+scenarios.length+' scenario'+(scenarios.length===1?'':'s')+'</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px;margin-top:13px">'+order.map(id=>playerCard(d,e,id)).join('')+'</div>'+
      '<div class="mini" style="margin-top:10px">Paths are possible outcome combinations, not probabilities. The screen appears automatically with '+MAX_REMAINING+' or fewer scored results remaining.</div>'+
    '</div>';
  }

  async function installPathToWin(){
    const box=el('leagueBox');
    if(!box||box.closest('.hidden')) return;
    document.getElementById('pathToWinCard')?.remove();
    try{
      const id=selectedWeekId();
      if(!id) return;
      const d=await loadPathData(id);
      const html=screenHtml(d);
      if(!html) return;
      const anchor=document.getElementById('weeklyStandingsV2');
      const temp=document.createElement('div');
      temp.innerHTML=html;
      const node=temp.firstElementChild;
      if(anchor) anchor.insertAdjacentElement('afterend',node);
      else box.insertAdjacentElement('afterbegin',node);
    }catch(e){ console.debug('Path to win skipped',e); }
  }

  const baseRenderLeague=window.renderLeague;
  if(baseRenderLeague){
    window.renderLeague=async function(){
      const v=await baseRenderLeague.apply(this,arguments);
      await installPathToWin();
      return v;
    };
  }

  const baseShowPage=window.showPage;
  if(baseShowPage){
    window.showPage=function(id){
      const v=baseShowPage.apply(this,arguments);
      if(id==='league') setTimeout(installPathToWin,300);
      return v;
    };
  }

  setTimeout(installPathToWin,1800);
})();
