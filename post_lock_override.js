// Commissioner-only post-lock pick correction tool.
(() => {
  const byId = id => document.getElementById(id);
  let overrideState = null;
  let rendering = false;

  const isLockedDraft = () => !!(week && week.status === 'draft' && new Date(week.lock_at).getTime() <= Date.now());
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const answerLabel = value => {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value && typeof value === 'object') {
      return String(value.label ?? value.name ?? value.display_name ?? value.team ?? value.short_name ?? value.abbreviation ?? JSON.stringify(value));
    }
    return String(value ?? '');
  };
  const optionValue = value => encodeURIComponent(JSON.stringify(value));
  const decodeOption = value => JSON.parse(decodeURIComponent(value));

  async function fetchState() {
    if (profile?.role !== 'commissioner' || !week || !isLockedDraft()) return null;
    const wid = week.id;
    const [players, questions, picks, activity] = await Promise.all([
      db('profiles?select=id,display_name,username&order=display_name.asc'),
      db('questions?week_id=eq.'+wid+'&select=id,position,prompt,answer_options&order=position.asc'),
      db('picks?week_id=eq.'+wid+'&select=user_id,question_id,answer,updated_at'),
      db('commissioner_activity_log?week_id=eq.'+wid+'&action_type=eq.post_lock_pick_override&select=id,summary,details,created_at&order=created_at.desc&limit=10')
    ]);
    overrideState = {players, questions, picks, activity};
    return overrideState;
  }

  function currentPick(playerId, questionId) {
    return overrideState?.picks.find(p => p.user_id === playerId && p.question_id === questionId) || null;
  }

  function currentQuestion() {
    const qid = byId('lockedPickQuestion')?.value;
    return overrideState?.questions.find(q => q.id === qid) || overrideState?.questions[0] || null;
  }

  function renderAnswerOptions() {
    const select = byId('lockedPickAnswer');
    const current = byId('lockedPickCurrent');
    if (!select || !overrideState) return;
    const playerId = byId('lockedPickPlayer')?.value;
    const question = currentQuestion();
    const pick = question ? currentPick(playerId, question.id) : null;
    const options = Array.isArray(question?.answer_options) ? question.answer_options : [];
    select.innerHTML = options.map(answer => '<option value="'+optionValue(answer)+'"'+(pick && same(answer,pick.answer)?' selected':'')+'>'+esc(answerLabel(answer))+'</option>').join('');
    current.textContent = pick ? 'Current locked pick: '+answerLabel(pick.answer) : 'No existing pick for this question.';
    byId('lockedPickSave').disabled = !pick || !question || !options.length;
  }

  function activityHtml(rows) {
    if (!rows?.length) return '<p class="muted">No post-lock changes have been made this week.</p>';
    return rows.map(row => {
      const d = row.details || {};
      const when = new Date(row.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      return '<div class="player-row" style="grid-template-columns:1fr auto;align-items:center">'+
        '<div><b>'+esc(d.player_name || row.summary || 'Pick changed')+'</b><div class="mini">'+esc(d.question || '')+'</div><div class="mini">'+esc(answerLabel(d.old_answer))+' → '+esc(answerLabel(d.new_answer))+(d.reason?' · '+esc(d.reason):'')+'</div></div>'+
        '<span class="pill">'+esc(when)+'</span></div>';
    }).join('');
  }

  async function renderTool() {
    if (rendering) return;
    rendering = true;
    try {
      byId('postLockPickOverride')?.remove();
      if (profile?.role !== 'commissioner' || !week || !isLockedDraft()) return;
      const data = await fetchState();
      if (!data) return;
      const host = byId('commissionerBox');
      if (!host) return;
      const card = document.createElement('section');
      card.id = 'postLockPickOverride';
      card.className = 'card';
      card.innerHTML = '<div class="eyebrow">COMMISSIONER OVERRIDE</div><h2>Change a pick after lock</h2>'+
        '<p class="muted">Use this only for a player-requested correction. Every change is timestamped in the commissioner activity log. Published weeks stay locked.</p>'+
        '<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">'+
          '<div><label for="lockedPickPlayer">Player</label><select id="lockedPickPlayer">'+data.players.map(p=>'<option value="'+p.id+'">'+esc(p.display_name || p.username)+'</option>').join('')+'</select></div>'+
          '<div><label for="lockedPickQuestion">Question</label><select id="lockedPickQuestion">'+data.questions.map(q=>'<option value="'+q.id+'">#'+q.position+' · '+esc(q.prompt)+'</option>').join('')+'</select></div>'+
        '</div>'+
        '<label for="lockedPickAnswer">Replacement pick</label><select id="lockedPickAnswer"></select><div id="lockedPickCurrent" class="mini"></div>'+
        '<label for="lockedPickReason">Reason</label><input id="lockedPickReason" maxlength="180" placeholder="Example: Player requested correction after lock">'+
        '<button id="lockedPickSave" class="btn full" type="button">Save post-lock change</button><div id="lockedPickMsg" class="msg muted"></div>'+
        '<details style="margin-top:14px"><summary><b>Recent post-lock changes</b></summary>'+activityHtml(data.activity)+'</details>';
      host.insertAdjacentElement('afterbegin',card);
      renderAnswerOptions();
    } catch (e) {
      const host = byId('commissionerBox');
      if (host && !byId('postLockPickOverride')) host.insertAdjacentHTML('afterbegin','<div id="postLockPickOverride" class="notice">Post-lock pick editor could not load. Reopen Commissioner to retry.</div>');
      console.error('Post-lock pick editor', e);
    } finally {
      rendering = false;
    }
  }

  document.addEventListener('change', event => {
    if (event.target?.id === 'lockedPickPlayer' || event.target?.id === 'lockedPickQuestion') renderAnswerOptions();
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('#lockedPickSave');
    if (!button || button.disabled) return;
    const playerId = byId('lockedPickPlayer')?.value;
    const questionId = byId('lockedPickQuestion')?.value;
    const reason = byId('lockedPickReason')?.value.trim();
    const rawAnswer = byId('lockedPickAnswer')?.value;
    const msg = byId('lockedPickMsg');
    const player = overrideState?.players.find(p => p.id === playerId);
    const question = overrideState?.questions.find(q => q.id === questionId);
    const existing = currentPick(playerId, questionId);
    if (!player || !question || !existing || !rawAnswer) return;
    if (!reason || reason.length < 3) { msg.textContent = 'Add a short reason for the change.'; return; }
    const answer = decodeOption(rawAnswer);
    if (same(answer, existing.answer)) { msg.textContent = 'Choose a different answer first.'; return; }
    if (!confirm('Change '+(player.display_name || player.username)+'\'s locked pick on “'+question.prompt+'” from '+answerLabel(existing.answer)+' to '+answerLabel(answer)+'?')) return;
    button.disabled = true;
    msg.textContent = 'Saving…';
    try {
      await db('rpc/commissioner_override_locked_pick', {method:'POST', body:JSON.stringify({
        p_week_id: week.id,
        p_user_id: playerId,
        p_question_id: questionId,
        p_answer: answer,
        p_reason: reason
      })});
      msg.textContent = 'Pick changed and logged.';
      if (typeof loadData === 'function') await loadData();
      if (typeof renderHome === 'function') renderHome();
      await renderTool();
    } catch (e) {
      msg.textContent = e.message || 'Could not change the pick.';
      button.disabled = false;
    }
  });

  const previousRenderCommissioner = window.renderCommissioner;
  window.renderCommissioner = async function() {
    const result = previousRenderCommissioner ? await previousRenderCommissioner.apply(this, arguments) : undefined;
    await renderTool();
    return result;
  };

  if (session && week && profile?.role === 'commissioner') renderTool();
})();
