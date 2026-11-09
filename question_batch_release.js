// Commissioner question batches: prepare privately, then release the complete card once.
(() => {
  const $ = id => document.getElementById(id);
  const safe = value => typeof esc === 'function' ? esc(String(value??'')) : String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let batchPreview=null, busy=false;

  function style(){
    if($('questionBatchStyles'))return;
    const node=document.createElement('style');
    node.id='questionBatchStyles';
    node.textContent=`
      .batch-status{display:inline-flex;align-items:center;border:1px solid var(--line,#394556);border-radius:999px;padding:5px 10px;font-weight:800;font-size:12px;margin:5px 0 9px}
      .batch-status.private{color:#fbbf24;background:rgba(251,191,36,.10)}
      .batch-status.live{color:#86efac;background:rgba(134,239,172,.09)}
      .batch-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}
      .batch-actions .btn{min-height:44px}
      .batch-input{width:100%;min-height:128px;resize:vertical;font:13px/1.5 ui-monospace,monospace}
      .batch-examples{font-size:12px;line-height:1.5;color:var(--muted,#94a3b8);overflow-wrap:anywhere}
      .batch-preview{margin:12px 0;border:1px solid var(--line,#394556);border-radius:10px;padding:12px;overflow-wrap:anywhere}
      .batch-preview ol{padding-left:20px;margin:8px 0}
      .batch-preview li{margin:5px 0}
      .batch-errors{color:#fca5a5;font-size:13px}
      @media(max-width:600px){.batch-actions .btn{flex:1 1 100%}.batch-input{min-height:150px}}
    `;
    document.head.appendChild(node);
  }

  function releaseCard(){
    const isPrivate=!week.questions_released_at;
    const legacy=week.batch_release_enforced===false;
    const isLocked=locked();
    const count=questions.length;
    const releasedTime=week.questions_released_at?new Date(week.questions_released_at).toLocaleString():'';
    const message=isPrivate
      ? '<p class="muted">Only you can see this week and its questions. Add or import everything first, then release the complete card with one click. Players cannot pick until you release it.</p>'
      : legacy
        ? '<p class="muted">This week was already live when batch release was introduced. Its existing questions and submitted picks are unchanged. New weeks will stay private until you release them.</p>'
        : '<p class="muted">The entire question card is now visible to players. New questions cannot be added to this released week, so nothing appears unexpectedly later.</p>';
    const button=isPrivate
      ? '<div class="batch-actions"><button type="button" class="btn" id="releaseQuestionBatch" onclick="releaseQuestionBatch()" '+(count===0||isLocked?'disabled':'')+'>Release all '+count+' questions to players</button></div>'
        +(count===0?'<p class="batch-examples">Add at least one question before releasing.</p>':'')
        +(isLocked?'<p class="batch-errors">The lock deadline has passed. Set a future deadline before releasing questions.</p>':'')
      : '<p class="batch-examples">Released '+safe(releasedTime)+'</p>';
    const bulk=isPrivate&&!isLocked
      ? '<div class="batch-import"><h3>Bulk add questions</h3>'
        +'<p class="batch-examples">Paste one question per line as <b>Sport | Question | Choice 1 | Choice 2</b> (add more choices if needed), or upload a CSV file with the same columns.</p>'
        +'<textarea class="batch-input" id="questionBatchText" placeholder="NFL | Who wins the game? | Team A | Team B\nCFB | Which team scores first? | Home | Away"></textarea>'
        +'<div class="batch-actions"><label for="questionBatchFile" class="btn secondary" style="cursor:pointer">Choose CSV / TSV file</label><input id="questionBatchFile" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" style="position:absolute;width:1px;height:1px;opacity:0" />'
        +'<button type="button" class="btn secondary" onclick="previewQuestionBatch()">Preview batch</button></div>'
        +'<div id="questionBatchPreview" aria-live="polite"></div></div>'
      : '';
    return '<section class="card" id="questionBatchReleaseCard">'
      +'<div class="eyebrow">QUESTION RELEASE</div><h2>Release every question together</h2>'
      +'<span class="batch-status '+(isPrivate?'private':'live')+'">'+(isPrivate?'Private draft':'Live to players')+'</span>'
      +'<p><b>'+count+' questions '+(isPrivate?'prepared':'available')+'</b></p>'
      +message+button+bulk+'</section>';
  }

  const baseCommissioner=window.renderCommissioner;
  window.renderCommissioner=async function(...args){
    const result=await baseCommissioner.apply(this,args);
    if(profile?.role!=='commissioner'||!week||!$('commissionerBox'))return result;
    style();
    $('questionBatchReleaseCard')?.remove();
    $('commissionerBox').insertAdjacentHTML('afterbegin',releaseCard());
    if(week.batch_release_enforced!==false && week.questions_released_at){
      // New weeks have a frozen card after release; do not show an unusable add button.
      for(const card of $('commissionerBox').querySelectorAll('.card')){
        if(card.querySelector('h2')?.textContent?.trim()==='Add Question')card.remove();
      }
    }
    return result;
  };

  const baseHome=window.renderHome;
  window.renderHome=function(...args){
    const result=baseHome.apply(this,args);
    if(!week){
      if($('homeLock'))$('homeLock').textContent='The next question card is being prepared. It will appear when the commissioner releases it.';
    }else if(!week.questions_released_at){
      if($('homeAction'))$('homeAction').classList.add('hidden');
      if($('homeLock'))$('homeLock').textContent='Private setup — players cannot see this week or its questions until you release the complete card.';
    }
    return result;
  };

  const basePicks=window.renderPicks;
  window.renderPicks=function(...args){
    const result=basePicks.apply(this,args);
    if(!week || !week.questions_released_at){
      if($('pickBox'))$('pickBox').innerHTML='<div class="notice"><b>Questions are being prepared.</b><p class="muted">The complete set will appear together when the commissioner releases it.</p><button type="button" class="btn secondary" onclick="checkQuestionRelease()">Check for questions</button></div>';
      if($('nextPickBtn'))$('nextPickBtn').disabled=true;
      if($('picksWeek'))$('picksWeek').textContent='WAITING FOR QUESTION RELEASE';
    }
    return result;
  };

  window.checkQuestionRelease=async function(){
    try{
      await loadData();
      renderHome();
      renderPicks();
    }catch(e){alert('Could not check for new questions. Try refreshing.');}
  };

  window.previewQuestionBatch=function(){
    const input=$('questionBatchText');
    if(!input)return;
    const parsed=window.QuestionBatchModel.parse(input.value);
    batchPreview={weekId:week?.id,text:input.value,...parsed};
    const target=$('questionBatchPreview');
    if(!target)return;
    if(parsed.errors.length){
      target.innerHTML='<div class="batch-preview batch-errors"><b>Fix these rows first:</b><ul>'+parsed.errors.map(s=>'<li>'+safe(s)+'</li>').join('')+'</ul></div>';
      return;
    }
    target.innerHTML='<div class="batch-preview"><b>'+parsed.questions.length+' questions ready to add privately</b>'
      +'<ol>'+parsed.questions.slice(0,12).map(q=>'<li><b>'+safe(q.sport)+'</b> · '+safe(q.prompt)+' <span class="muted">('+q.answer_options.length+' choices)</span></li>').join('')+'</ol>'
      +(parsed.questions.length>12?'<p class="batch-examples">And '+(parsed.questions.length-12)+' more.</p>':'')
      +'<button type="button" class="btn" onclick="importQuestionBatch()">Add '+parsed.questions.length+' questions to private draft</button></div>';
  };

  document.addEventListener('change',async event=>{
    if(event.target?.id!=='questionBatchFile')return;
    const file=event.target.files?.[0];
    if(!file)return;
    try{
      if(file.size>1024*1024)throw Error('File is too large. Keep question files under 1 MB.');
      $('questionBatchText').value=await file.text();
      window.previewQuestionBatch();
    }catch(e){alert(e.message||'Could not read this file.');}
  });

  window.importQuestionBatch=async function(){
    if(busy||profile?.role!=='commissioner'||!week||week.questions_released_at||locked())return;
    const input=$('questionBatchText');
    if(!batchPreview||batchPreview.weekId!==week.id||batchPreview.text!==input?.value||batchPreview.errors.length){
      return alert('Preview the current batch before adding it.');
    }
    const incoming=batchPreview.questions;
    if(!incoming.length)return;
    if(!confirm('Add all '+incoming.length+' questions to your PRIVATE draft? Players will not see them until you release the entire card.'))return;
    busy=true;
    try{
      const rows=incoming.map((q,i)=>({...q,week_id:week.id,position:questions.length+i+1}));
      // One atomic PostgREST insert: either the entire batch saves or none does.
      await db('questions',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});
      batchPreview=null;
      await loadData();
      renderHome();
      await renderCommissioner();
      alert('Added '+rows.length+' questions privately. Release them together when the card is ready.');
    }catch(e){alert('Could not import the question batch: '+(e.message||'Unknown error'));}
    finally{busy=false;}
  };

  window.releaseQuestionBatch=async function(){
    if(busy||profile?.role!=='commissioner'||!week||week.questions_released_at)return;
    if(locked())return alert('Set a future lock deadline before releasing.');
    if(!questions.length)return alert('Add your questions first.');
    const count=questions.length;
    if(!confirm('Release ALL '+count+' questions for '+week.name+' now? Players will immediately see the full card and can submit picks. You cannot add more questions after releasing.'))return;
    busy=true;
    const button=$('releaseQuestionBatch');
    if(button){button.disabled=true;button.textContent='Releasing…';}
    try{
      const result=await db('rpc/commissioner_release_week_questions',{
        method:'POST',
        body:JSON.stringify({p_week_id:week.id})
      });
      await loadData();
      renderHome();
      await renderCommissioner();
      alert('All '+(result?.questions??count)+' questions are now live together.');
    }catch(e){
      alert('Questions were not released: '+(e.message||'Please check the questions and deadline.'));
      await renderCommissioner();
    }finally{busy=false;}
  };

  // Existing live weeks are grandfathered; newly created weeks are strictly frozen after release.
  const baseAdd=window.addQuestion;
  window.addQuestion=async function(...args){
    if(week?.questions_released_at && week?.batch_release_enforced!==false){
      return alert('This question card is already released. Add all questions before releasing the next week.');
    }
    return baseAdd.apply(this,args);
  };
})();
