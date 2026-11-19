// Review uses only the signed-in member's already-loaded picks and confirmed submissions.
(() => {
  const drafts=new Map();
  let busy=false, editing=null;
  const key=()=>JSON.stringify([session?.user?.id,week?.id]);
  const answer=value=>esc(typeof value==='object'?JSON.stringify(value):value??'Not picked');
  const tieValue=()=>drafts.has(key())?drafts.get(key()):submission?.tiebreaker_answer??'';
  const available=()=>session?.user?.id&&week&&week.questions_released_at&&!locked();
  function statusHtml(){
    if(submission){
      const date=new Date(submission.submitted_at);
      const stamp=Number.isFinite(date.getTime())?'Submitted at '+date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+' · '+date.toLocaleDateString(): 'Entry submitted';
      return '<div id="pickReceipt" class="notice pick-receipt" role="status" tabindex="-1"><b>✓ '+esc(stamp)+'</b><div class="mini">'+(locked()?'Your entry is locked.':'Your latest saved picks are included. Submit again if you change the tiebreaker.')+'</div></div>';
    }
    return '<div id="pickReceipt" class="notice pick-receipt" role="status" tabindex="-1"><b>Not submitted</b><div class="mini">'+(locked()?'This week is locked. Saved picks without a submitted entry do not count.':'Picks save as you choose. Review and submit your entry to finish.')+'</div></div>';
  }
  function render(readonly=locked()){
    const box=el('pickBox'),next=el('nextPickBtn');
    const missing=questions.filter(q=>q.counts_for_score!==false&&myPicks[q.id]===undefined).length;
    box.innerHTML=statusHtml()+'<h2>'+(readonly?'Your picks':'Review your picks')+'</h2>'+
      (!readonly?'<p class="muted">Check every answer and your tiebreaker before submitting.</p>':'')+
      '<ol class="pick-review-list">'+questions.map((q,i)=>'<li><div><b>'+esc(q.prompt)+'</b><div>'+answer(myPicks[q.id])+'</div>'+(q.counts_for_score===false?'<small class="muted">Just for fun · not scored</small>':'')+'</div>'+(!readonly?'<button type="button" class="btn secondary" data-review-edit="'+i+'" aria-label="Edit question '+(i+1)+'">Edit</button>':'')+'</li>').join('')+'</ol>'+
      '<label for="tbInput">'+esc(week.tiebreaker_prompt||'Tiebreaker answer')+'</label>'+
      (readonly?'<p>'+answer(submission?.tiebreaker_answer)+'</p>':'<input id="tbInput" type="number" step="any" inputmode="decimal" value="'+esc(tieValue())+'">')+
      (!readonly&&missing?'<p class="bad">'+missing+' scored pick'+(missing===1?' is':'s are')+' still missing.</p>':'')+
      '<p id="pickReviewStatus" role="status" aria-live="polite"></p>';
    el('progressBar').style.width=(submission||readonly?100:Math.round(Object.keys(myPicks).length/Math.max(1,questions.length)*100))+'%';
    next.textContent=readonly?'Picks locked':busy?'Submitting…':submission?'Save entry changes':'Submit picks';
    next.disabled=readonly||busy||missing>0;
    box.querySelectorAll('[data-review-edit]').forEach(button=>button.onclick=()=>{
      if(busy||!available())return;
      editing=key();step=Number(button.dataset.reviewEdit);renderPicks();
    });
    const input=el('tbInput');
    if(input&&!readonly){input.disabled=busy;input.oninput=()=>drafts.set(key(),input.value);}
    if(busy)box.querySelectorAll('button').forEach(button=>button.disabled=true);
  }
  async function choose(id,value){
    if(busy||!available())return;
    const weekId=week.id,userId=session.user.id,index=step;
    busy=true;
    el('pickBox').querySelectorAll('button').forEach(button=>button.disabled=true);
    el('nextPickBtn').disabled=true;
    try{
      await db('picks?on_conflict=week_id,question_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({week_id:weekId,question_id:id,user_id:userId,answer:value})});
      if(week?.id!==weekId||session?.user?.id!==userId)return;
      myPicks[id]=value;
      if(editing===key()){step=questions.length;editing=null;}
      else if(step===index)step=Math.min(step+1,questions.length);
    }catch{alert('Could not save this pick. Please try again; the week may have locked.');}
    finally{busy=false;if(week?.id===weekId&&session?.user?.id===userId)renderPicks();}
  }
  async function submit(){
    if(busy||!available())return;
    const raw=el('tbInput')?.value;
    if(raw===undefined||raw.trim()===''||!Number.isFinite(Number(raw)))return alert('Enter a valid tiebreaker number.');
    if(questions.some(q=>q.counts_for_score!==false&&myPicks[q.id]===undefined))return alert('Finish every scored pick first.');
    const weekId=week.id,userId=session.user.id,draftId=key();
    drafts.set(draftId,raw);busy=true;render(false);
    let confirmed=false;
    try{
      const rows=await db('submissions?on_conflict=week_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({week_id:weekId,user_id:userId,tiebreaker_answer:Number(raw),submitted_at:new Date().toISOString()})});
      const receipt=rows?.find(row=>row.week_id===weekId&&row.user_id===userId&&row.submitted_at);
      if(!receipt)throw Error('No confirmation');
      confirmed=true;
      if(week?.id!==weekId||session?.user?.id!==userId)return;
      submission=receipt;drafts.delete(draftId);editing=null;step=questions.length;
      // Refresh the early-lock state without clearing the confirmed entry on a read failure.
      try{const latest=await db('weeks?id=eq.'+weekId+'&select=*');if(week?.id===weekId&&session?.user?.id===userId&&latest?.[0])week=latest[0];}catch{}
      renderHome();
    }catch{
      if(week?.id===weekId&&session?.user?.id===userId){
        const status=el('pickReviewStatus');
        if(status)status.textContent='Could not confirm submission. Your saved picks are still here. Please try submitting again.';
      }
    }finally{
      busy=false;
      if(week?.id===weekId&&session?.user?.id===userId){
        if(confirmed){renderPicks();el('pickReceipt')?.focus?.({preventScroll:false});}
        else {el('nextPickBtn').disabled=false;el('nextPickBtn').textContent='Retry submission';}
      }
    }
  }
  window.PickReview={render,statusHtml,choose,submit,isBusy:()=>busy,open(){if(busy)return;step=questions.length;renderPicks();}};
})();
