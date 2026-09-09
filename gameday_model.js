// Read-only GameDay calculations. Official scores remain owned by the commissioner.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameDayModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const decided = q => q.result !== null && q.result !== undefined;
  const numeric = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const name = p => p?.display_name || p?.username || 'Player';
  const resultOrder = (a, b) => Number(a.result_order ?? 999999) - Number(b.result_order ?? 999999) || Number(a.position || 0) - Number(b.position || 0);
  const rankLabel = row => row?.rank ? (row.tied ? 'T' : '#') + row.rank : '—';
  const answerLabel = answer => answer === undefined ? 'No pick' : typeof answer === 'string' ? answer : JSON.stringify(answer);

  function canOpen(w, now = Date.now()) {
    return !!w && (w.status === 'published' || !!w.auto_locked_at || Number.isFinite(Date.parse(w.lock_at)) && now >= Date.parse(w.lock_at));
  }

  // Check the week before requesting anybody's picks, including on manual refresh.
  // Existing database row policies still provide the authorization boundary.
  async function loadBundle(read, weekId, now = () => Date.now()) {
    const id = encodeURIComponent(weekId);
    const weekPath = 'weeks?id=eq.' + id + '&select=*&limit=1';
    const w = (await read(weekPath))[0];
    if (!canOpen(w, now())) return {week: w || null, private: true};
    async function previousScores() {
      if (w.phase === 'playoff' || !w.season_id || !numeric(w.number)) return [];
      const previous = await read('weeks?season_id=eq.' + encodeURIComponent(w.season_id) + '&number=lt.' + Number(w.number) + '&phase=eq.regular&status=eq.published&select=id&order=number.desc&limit=1');
      return previous[0] ? read('week_scores?week_id=eq.' + encodeURIComponent(previous[0].id) + '&select=user_id,correct_count,question_count') : [];
    }
    const [profiles, slots, questions, submissions, picks, scores, previous] = await Promise.all([
      read('profiles?select=id,display_name,username,role&order=display_name.asc'),
      read('player_slots?select=slot,display_name,claimed_by&order=slot.asc'),
      read('questions?week_id=eq.' + id + '&select=*&order=position.asc'),
      read('submissions?week_id=eq.' + id + '&select=user_id,tiebreaker_answer,submitted_at'),
      read('picks?week_id=eq.' + id + '&select=user_id,question_id,answer'),
      read('week_scores?week_id=eq.' + id + '&select=*'),
      previousScores()
    ]);
    // Discard the response if the commissioner reopened this week during loading.
    const fresh = (await read(weekPath))[0];
    if (!canOpen(fresh, now())) return {week: fresh || null, private: true};
    if (![profiles, slots, questions, submissions, picks, scores, previous].every(Array.isArray)) throw new Error('Incomplete GameDay response');
    return {week: fresh, profiles, slots, questions, submissions, picks, scores, previous};
  }

  function liveRanks(rows, hasResults, hasTiebreaker) {
    rows.sort((a, b) => b.correct - a.correct || (hasTiebreaker ? (a.distance ?? Infinity) - (b.distance ?? Infinity) : 0) || a.name.localeCompare(b.name));
    let i = 0;
    while (i < rows.length) {
      let j = i + 1;
      while (j < rows.length && rows[j].correct === rows[i].correct && (!hasTiebreaker || rows[j].distance === rows[i].distance)) j++;
      for (let k = i; k < j; k++) { rows[k].rank = hasResults ? i + 1 : null; rows[k].tied = hasResults && j - i > 1; }
      i = j;
    }
    return rows;
  }

  function build(data, userId) {
    const w = {...data.week};
    const profiles = new Map(data.profiles.map(p => [p.id, p]));
    const submissions = new Map(data.submissions.map(s => [s.user_id, s]));
    const scores = new Map(data.scores.map(s => [s.user_id, {...s}]));
    const previous = new Map(data.previous.map(s => [s.user_id, s]));
    const picks = new Map();
    for (const p of data.picks) {
      if (!picks.has(p.user_id)) picks.set(p.user_id, new Map());
      picks.get(p.user_id).set(p.question_id, p.answer);
    }
    const roster = new Map();
    const commissioner = data.profiles.find(p => p.role === 'commissioner');
    if (commissioner) roster.set(commissioner.id, commissioner);
    for (const s of data.slots) {
      const p = profiles.get(s.claimed_by);
      const id = s.claimed_by || 'slot-' + s.slot;
      roster.set(id, p || {id, display_name: s.display_name || 'Player ' + s.slot});
    }
    // Preserve historical entrants if a slot has since changed hands.
    for (const id of new Set([...submissions.keys(), ...scores.keys()])) {
      if (!roster.has(id)) roster.set(id, profiles.get(id) || {id, display_name: 'Player'});
    }
    const questions = data.questions.map(q => ({...q})).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
    const scored = questions.filter(q => q.counts_for_score !== false);
    const resolved = scored.filter(decided).sort(resultOrder);
    const hasTiebreaker = numeric(w.tiebreaker_result);
    const published = w.status === 'published';
    const rows = [...roster].map(([id, p]) => {
      const sub = submissions.get(id), score = published ? scores.get(id) : null;
      const answers = Object.fromEntries(questions.filter(q => picks.get(id)?.has(q.id)).map(q => [q.id, picks.get(id).get(q.id)]));
      let streak = 0;
      for (const q of [...resolved].reverse()) { if (!same(answers[q.id], q.result)) break; streak++; }
      const prev = previous.get(id);
      const streakEligible = !!prev && Number(prev.question_count) > 0 && Number(prev.correct_count) === Number(prev.question_count);
      let opening = 0;
      if (streakEligible) for (const q of resolved) { if (!same(answers[q.id], q.result)) break; opening++; }
      return {
        id, name: name(p), entered: !!sub, answers, score,
        correct: score ? Number(score.correct_count) : resolved.filter(q => same(answers[q.id], q.result)).length,
        total: score ? Number(score.question_count) : scored.length,
        remaining: scored.filter(q => !decided(q) && answers[q.id] !== undefined).length,
        tiebreaker: sub?.tiebreaker_answer,
        distance: hasTiebreaker && numeric(sub?.tiebreaker_answer) ? Math.abs(Number(sub.tiebreaker_answer) - Number(w.tiebreaker_result)) : null,
        rank: null, tied: false, streak, streakEligible, opening
      };
    });
    const entered = rows.filter(r => r.entered || r.score);
    if (published) {
      entered.forEach(r => { r.rank = r.score && numeric(r.score.placement) ? Number(r.score.placement) : null; });
      entered.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
      entered.forEach(r => { r.tied = !!r.rank && entered.some(other => other.id !== r.id && other.rank === r.rank); });
    } else liveRanks(entered, resolved.length > 0, hasTiebreaker);
    const orderedRows = [...entered, ...rows.filter(r => !r.entered && !r.score).sort((a, b) => a.name.localeCompare(b.name))];
    const me = rows.find(r => r.id === userId) || null;
    const complete = scored.length > 0 && resolved.length === scored.length;
    // A partial roster or missing pick can look falsely unique. Wait for all 8 entries.
    const bonusReady = w.phase !== 'playoff' && entered.length === 8 && entered.every(r => r.entered && scored.every(q => r.answers[q.id] !== undefined));
    const bonuses = [];
    if (w.phase !== 'playoff' && me?.score) {
      for (const [key, label] of [['unicorn_bonus', 'Unicorn'], ['upset_bonus', 'Upset'], ['streak_bonus', 'Opening streak'], ['perfect_bonus', 'Perfect week'], ['cold_bonus', 'Cold week']]) {
        if (Number(me.score[key])) bonuses.push({label, points: Number(me.score[key]), official: true});
      }
    } else if (me?.entered && bonusReady && !published) {
      let unicorn = 0, upset = 0;
      for (const q of resolved) {
        if (!same(me.answers[q.id], q.result)) continue;
        const winners = entered.filter(r => same(r.answers[q.id], q.result)).length;
        if (winners === 1) unicorn++;
        else if (winners === 2) upset++;
      }
      if (unicorn) bonuses.push({label: 'Unicorn', points: unicorn * 3, count: unicorn});
      if (upset) bonuses.push({label: 'Upset', points: upset * 0.5, count: upset});
      if (me.opening) bonuses.push({label: 'Opening streak', points: me.opening * 0.5, count: me.opening});
      if (complete && me.correct === scored.length) bonuses.push({label: 'Perfect week', points: 5});
      if (complete && me.correct === 0) bonuses.push({label: 'Cold week', points: -5});
    }
    const keyPicks = [];
    if (w.phase !== 'playoff' && me?.entered && !published) for (const q of scored.filter(q => !decided(q) && me.answers[q.id] !== undefined)) {
      const opponents = entered.filter(r => r.id !== me.id && r.answers[q.id] !== undefined && !same(r.answers[q.id], me.answers[q.id]))
        .sort((a, b) => Math.abs(a.correct - me.correct) - Math.abs(b.correct - me.correct) || (a.rank ?? 1) - (b.rank ?? 1) || a.name.localeCompare(b.name));
      if (!opponents.length) continue;
      const projection = liveRanks(entered.map(r => ({...r, correct: r.correct + (same(r.answers[q.id], me.answers[q.id]) ? 1 : 0)})), true, hasTiebreaker).find(r => r.id === me.id);
      keyPicks.push({questionId: q.id, opponents: opponents.map(r => r.id), projectedRank: rankLabel(projection), gap: Math.abs(opponents[0].correct - me.correct)});
    }
    keyPicks.sort((a, b) => a.gap - b.gap || b.opponents.length - a.opponents.length);
    return {week: w, userId, questions, rows: orderedRows, me, resolved: resolved.length, total: scored.length, remaining: scored.length - resolved.length, complete, published, hasTiebreaker, bonusReady, bonuses, keyPicks};
  }

  function changes(before, after) {
    if (!before || before.week.id !== after.week.id || before.userId !== after.userId) return {results: [], movement: [], tiebreaker: false, publication: false};
    const oldQuestions = new Map(before.questions.map(q => [q.id, q]));
    const results = after.questions.filter(q => {
      const old = oldQuestions.get(q.id);
      return old ? !same(old.result, q.result) && (decided(old) || decided(q)) : decided(q);
    }).map(q => ({id: q.id, prompt: q.prompt, result: q.result, corrected: decided(oldQuestions.get(q.id) || {})}));
    const oldRows = new Map(before.rows.map(r => [r.id, r]));
    const movement = after.rows.flatMap(r => {
      const old = oldRows.get(r.id);
      return old?.rank && r.rank && old.rank !== r.rank ? [{id: r.id, from: rankLabel(old), to: rankLabel(r), delta: old.rank - r.rank}] : [];
    });
    return {results, movement, tiebreaker: !same(before.week.tiebreaker_result, after.week.tiebreaker_result), publication: before.published !== after.published};
  }
  return {same, decided, numeric, resultOrder, rankLabel, answerLabel, canOpen, loadBundle, build, changes};
});
