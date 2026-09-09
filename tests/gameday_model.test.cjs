const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../gameday_model.js');

function fixture() {
  const profiles = Array.from({length: 8}, (_, i) => ({id: 'p' + i, display_name: 'Member ' + i, role: i ? 'player' : 'commissioner'}));
  const questions = Array.from({length: 4}, (_, i) => ({id: 'q' + i, position: i + 1, prompt: 'Question ' + i, answer_options: ['A', 'B'], result: null, counts_for_score: i !== 3}));
  return {
    week: {id: 'week-2', number: 2, season_id: 'season', name: 'Week 2', status: 'open', lock_at: '2026-09-01T00:00:00Z', tiebreaker_result: null},
    profiles, slots: profiles.slice(1).map((p, i) => ({slot: i + 1, claimed_by: p.id, display_name: p.display_name})),
    questions, submissions: profiles.map((p, i) => ({user_id: p.id, tiebreaker_answer: 40 + i * 2})),
    picks: profiles.flatMap((p, i) => questions.map((q, j) => ({user_id: p.id, question_id: q.id, answer: j === 0 && i === 0 || j === 1 && i < 2 ? 'A' : 'B'}))),
    scores: [], previous: []
  };
}

test('opening rules include scheduled, early, and published locks; missing deadlines stay private', () => {
  const now = Date.parse('2026-09-09T12:00:00Z');
  for (const w of [null, {}, {lock_at: 'invalid'}, {lock_at: '2026-09-10T00:00:00Z'}]) assert.equal(M.canOpen(w, now), false);
  for (const w of [{lock_at: '2026-09-09T12:00:00Z'}, {auto_locked_at: '2026-09-09T11:00:00Z'}, {status: 'published'}]) assert.equal(M.canOpen(w, now), true);
});

test('privacy gate does not request profiles, entries, or picks before lock', async () => {
  const paths = [];
  const bundle = await M.loadBundle(async path => { paths.push(path); return [{id: 'future', lock_at: '2099-01-01T00:00:00Z'}]; }, 'future');
  assert.equal(bundle.private, true);
  assert.equal(paths.length, 1);
  assert.match(paths[0], /^weeks\?id=/);
});

test('reopening a week during refresh discards the loaded private data', async () => {
  let weekReads = 0;
  const read = async path => path.startsWith('weeks?id=') ? [{id: 'week', lock_at: ++weekReads === 1 ? '2020-01-01T00:00:00Z' : '2099-01-01T00:00:00Z'}] : [];
  const bundle = await M.loadBundle(read, 'week');
  assert.equal(bundle.private, true);
  assert.equal(weekReads, 2);
  assert.equal(bundle.picks, undefined);
});

test('all eight members appear before results without invented ranks or bonuses', () => {
  const model = M.build(fixture(), 'p0');
  assert.equal(model.rows.length, 8);
  assert.ok(model.rows.every(r => r.rank === null));
  assert.equal(model.me.remaining, 3);
  assert.equal(model.resolved, 0);
  assert.deepEqual(model.bonuses, []);
});

test('live ranks use scored results, competition ties, and only entered members', () => {
  const data = fixture();
  data.questions[0].result = 'A';
  data.questions[3].result = 'B'; // An unscored answer cannot change standings or bonuses.
  data.submissions = data.submissions.filter(s => s.user_id !== 'p7');
  const model = M.build(data, 'p0');
  assert.equal(model.resolved, 1);
  assert.equal(M.rankLabel(model.me), '#1');
  assert.equal(M.rankLabel(model.rows.find(r => r.id === 'p1')), 'T2');
  assert.equal(model.rows.find(r => r.id === 'p7').rank, null);
  assert.equal(model.rows.length, 8);
  assert.equal(model.bonusReady, false);
  assert.deepEqual(model.bonuses, []);
});

test('tiebreaker distance orders equal correct counts and preserves exact ties', () => {
  const data = fixture();
  data.questions[0].result = 'A';
  data.week.tiebreaker_result = 43;
  const model = M.build(data, 'p1');
  assert.equal(M.rankLabel(model.me), 'T2'); // 42 and 44 are both one away.
  assert.equal(M.rankLabel(model.rows.find(r => r.id === 'p2')), 'T2');
  assert.equal(M.rankLabel(model.rows.find(r => r.id === 'p3')), '#4');
  data.submissions[1].tiebreaker_answer = '';
  assert.equal(M.build(data, 'p1').me.rank, 8);
  data.week.tiebreaker_result = 0;
  data.submissions[1].tiebreaker_answer = 0;
  assert.equal(M.build(data, 'p1').me.distance, 0);
});

test('Unicorn, Upset, and previous-perfect opening streak match commissioner rules', () => {
  const data = fixture();
  data.questions[0].result = 'A'; data.questions[0].result_order = 1;
  data.questions[1].result = 'A'; data.questions[1].result_order = 2;
  data.previous = [{user_id: 'p0', correct_count: 3, question_count: 3}];
  const model = M.build(data, 'p0');
  assert.deepEqual(model.bonuses.map(b => [b.label, b.points]), [['Unicorn', 3], ['Upset', .5], ['Opening streak', 1]]);
  assert.equal(model.bonuses.some(b => b.label === 'Perfect week'), false);
  assert.equal(M.build(data, 'p1').bonuses.some(b => b.label === 'Opening streak'), false);
  data.questions[2].result = 'A'; data.questions[2].result_order = 0; // A miss entered first stops the opening streak.
  assert.equal(M.build(data, 'p0').bonuses.some(b => b.label === 'Opening streak'), false);
});

test('perfect and cold bonuses wait for every scored result', () => {
  const data = fixture();
  data.questions[0].result = 'A'; data.questions[1].result = 'A';
  assert.equal(M.build(data, 'p7').bonuses.some(b => b.label === 'Cold week'), false);
  data.questions[2].result = 'A';
  assert.equal(M.build(data, 'p7').bonuses.find(b => b.label === 'Cold week').points, -5);
  data.questions[2].result = 'B';
  assert.equal(M.build(data, 'p0').bonuses.find(b => b.label === 'Perfect week').points, 5);
});

test('missing picks suppress misleading unique-answer bonuses', () => {
  const data = fixture();
  data.questions[0].result = 'A';
  data.picks = data.picks.filter(p => !(p.user_id === 'p7' && p.question_id === 'q0'));
  assert.deepEqual(M.build(data, 'p0').bonuses, []);
});

test('published placements, points, and bonuses use saved scores', () => {
  const data = fixture();
  data.questions[0].result = 'A';
  data.week.status = 'published';
  data.scores = [{user_id: 'p0', placement: 3, correct_count: 2, question_count: 3, total_points: 6.5, unicorn_bonus: 0, upset_bonus: .5}];
  const model = M.build(data, 'p0');
  assert.equal(model.me.rank, 3);
  assert.equal(model.me.correct, 2);
  assert.equal(model.me.score.total_points, 6.5);
  assert.deepEqual(model.bonuses.map(b => [b.label, b.points]), [['Upset', .5]]);
  assert.equal(model.rows.find(r => r.id === 'p1').rank, null);
  assert.deepEqual(model.keyPicks, []);
});

test('each member receives different, accurate unresolved comparisons', () => {
  const data = fixture();
  data.questions[1].result = 'A';
  const mine = M.build(data, 'p0');
  assert.equal(mine.keyPicks[0].questionId, 'q0');
  assert.equal(mine.keyPicks[0].opponents[0], 'p1');
  assert.equal(mine.keyPicks[0].projectedRank, '#1');
  const other = M.build(data, 'p7');
  assert.equal(other.me.id, 'p7');
  assert.deepEqual(other.keyPicks[0].opponents, ['p0']);
  assert.equal(other.keyPicks[0].projectedRank, 'T2');
  assert.equal(M.build(data, 'spectator').me, null);
});

test('corrections and cleared results explain real rank movements without false first-load movement', () => {
  const data = fixture();
  data.questions[0].result = 'A';
  const before = M.build(data, 'p0');
  assert.equal(M.changes(null, before).movement.length, 0);
  data.questions[0].result = 'B';
  const after = M.build(data, 'p0'), changes = M.changes(before, after);
  assert.equal(changes.results[0].corrected, true);
  assert.deepEqual(changes.movement.find(r => r.id === 'p0'), {id: 'p0', from: '#1', to: '#8', delta: -7});
  data.questions[0].result = null;
  assert.equal(M.changes(after, M.build(data, 'p0')).results[0].result, null);
  assert.equal(M.changes(before, M.build(data, 'p1')).movement.length, 0);
});

test('JSON answers compare using the existing scoring semantics', () => {
  const data = fixture();
  data.questions[0].result = ['A', 'B'];
  data.picks.find(p => p.user_id === 'p0' && p.question_id === 'q0').answer = ['A', 'B'];
  assert.equal(M.build(data, 'p0').me.correct, 1);
  assert.equal(M.answerLabel(['A', 'B']), '["A","B"]');
});
