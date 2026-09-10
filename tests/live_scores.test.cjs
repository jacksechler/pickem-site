const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../live_scores_model.js');

function fixture({id = '401000001', date = '2026-09-15T00:15:00Z', state = 'pre', name = 'STATUS_SCHEDULED', completed = false, score = '0'} = {}) {
  return {id, date, name: 'New England Patriots at Seattle Seahawks', status: {displayClock: '8:31', period: 3, type: {state, name, completed, shortDetail: state === 'in' ? '8:31 - 3rd' : completed ? 'Final' : 'Scheduled'}}, competitions: [{competitors: [
    {homeAway: 'home', score, team: {id: '26', displayName: 'Seattle Seahawks', name: 'Seahawks', location: 'Seattle', abbreviation: 'SEA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png'}},
    {homeAway: 'away', score: '10', team: {id: '17', displayName: 'New England Patriots', name: 'Patriots', location: 'New England', abbreviation: 'NE', logo: 'javascript:alert(1)'}}
  ], odds: [{details: 'NOT FOR DISPLAY'}]}], links: [{href: 'https://untrusted.example'}]};
}

test('scheduled teams have no invented 0–0 score and only score fields are kept', () => {
  const e = M.event(fixture(), 'nfl');
  assert.deepEqual(e.teams.map(t => t.score), [null, null]);
  assert.equal(e.day, '2026-09-14');
  assert.equal(e.teams[0].logo, '');
  assert.ok(e.teams[1].logo.startsWith('https://a.espncdn.com/'));
  assert.ok(!JSON.stringify(e).includes('NOT FOR DISPLAY'));
  assert.ok(!JSON.stringify(e).includes('untrusted.example'));
  assert.equal(e.url, 'https://www.espn.com/nfl/game/_/gameId/401000001');
});

test('live clock, zero score and final state stay distinct', () => {
  const live = M.event(fixture({state: 'in', name: 'STATUS_IN_PROGRESS'}), 'nfl');
  assert.equal(live.state, 'live'); assert.equal(live.clock, '8:31'); assert.equal(live.teams[1].score, 0);
  assert.equal(M.event(fixture({state: 'post', name: 'STATUS_FINAL', completed: true}), 'nfl').state, 'final');
  assert.equal(M.event(fixture({state: 'post', name: 'STATUS_POSTPONED', completed: true}), 'nfl').state, 'paused');
  assert.equal(M.event(fixture({state: 'post', name: 'STATUS_CANCELED', completed: true}), 'nfl').state, 'paused');
});

test('clear team matches handle reversed order and preserve ambiguous repeat matchups', () => {
  const games = [M.event(fixture(), 'nfl')];
  const q = {sport: 'NFL', answer_options: ['Seahawks', 'Patriots']};
  assert.equal(M.matches(q, games).length, 1);
  assert.equal(M.matches({...q, answer_options: ['Seattle', 'NE']}, games).length, 1);
  assert.equal(M.matches(q, [...games, M.event(fixture({id: '401000002'}), 'nfl')]).length, 2);
  assert.equal(M.matches({...q, answer_options: ['Yes', 'No']}, games).length, 0);
  assert.equal(M.matches({...q, answer_options: ['Seahawks +3.5', 'Patriots -3.5']}, games).length, 0);
});

test('league labels cover regular CFB, bowls, CFP, and CBB', () => {
  for (const key of ['CFB', 'Bowls', 'CFP']) assert.equal(M.league(key), 'college-football');
  assert.equal(M.league('CBB'), 'mens-college-basketball');
  assert.equal(M.league('other'), null);
  assert.equal(M.league('toString'), null);
  assert.equal(M.league('constructor'), null);
  assert.equal(M.league('__proto__'), null);
  assert.ok(M.boardUrl('CBB', '2026-11-02', '2026-11-02').includes('groups=50'));
  assert.ok(M.boardUrl('CFB', '2026-09-10', '2026-09-14').includes('groups=80'));
  assert.throws(() => M.boardUrl('nfl', '2026-09-31', '2026-10-01'));
  assert.throws(() => M.boardUrl('nfl', '2026-01-01', '2026-02-01'));
});

test('week range includes the Wednesday opener, Monday night, and extended semifinals', () => {
  assert.deepEqual(M.windowFor({lock_at: '2026-09-10T00:20:00Z'}, {starts_on: '2026-09-10', ends_on: '2026-09-14'}), {from: '2026-09-09', to: '2026-09-14'});
  assert.deepEqual(M.windowFor({lock_at: '2027-01-29T01:15:00Z'}, {starts_on: '2027-01-28', ends_on: '2027-02-08'}), {from: '2027-01-28', to: '2027-02-08'});
  assert.equal(M.windowFor({lock_at: '2026-09-11T00:20:00Z'}).to, '2026-09-14');
});

test('cache limits refreshes and retains last confirmed scores through failures', async () => {
  let now = Date.parse('2026-09-15T01:00:00Z'), calls = 0, fails = false;
  const client = new M.Client(async () => { calls++; if (fails) throw new Error('network'); return {ok: true, json: async () => ({events: [fixture({state: 'in', name: 'STATUS_IN_PROGRESS', score: '13'})]})}; }, () => now);
  const first = await client.readBoard('nfl', '2026-09-14', '2026-09-14');
  assert.equal(first.games[0].teams[1].score, 13); assert.equal(calls, 1);
  await client.readBoard('nfl', '2026-09-14', '2026-09-14'); assert.equal(calls, 1);
  now += 31000; fails = true;
  const stale = await client.readBoard('nfl', '2026-09-14', '2026-09-14');
  assert.equal(stale.stale, true); assert.equal(stale.checkedAt, first.checkedAt);
  assert.equal(stale.games[0].teams[1].score, 13);
  await client.readBoard('nfl', '2026-09-14', '2026-09-14'); assert.equal(calls, 2);
  now += 31000; fails = false;
  assert.equal((await client.readBoard('nfl', '2026-09-14', '2026-09-14')).stale, false);
});

test('invalid provider payloads and first-load failures report unavailable without a result', async () => {
  const client = new M.Client(async () => ({ok: true, json: async () => ({error: 'Unavailable'})}));
  const read = await client.readBoard('nfl', '2026-09-14', '2026-09-14');
  assert.equal(read.stale, true); assert.deepEqual(read.games, []); assert.equal(read.checkedAt, null);
});

test('linked games share a scoreboard request and rescheduled games follow their stable event ID', async () => {
  const calls = [];
  const client = new M.Client(async url => {
    calls.push(url);
    return {ok: true, json: async () => url.includes('/summary') ? {header: fixture({id: '401000002', date: '2026-09-16T23:00:00Z'})} : {events: [fixture()]}};
  });
  const qs = ['401000001', '401000002', '401000001'].map((id, i) => ({id: i, espn_event_id: id, espn_league: 'nfl', espn_event_date: '2026-09-14'}));
  const result = await client.readLinks(qs);
  assert.equal(calls.length, 2); assert.equal(result.size, 2);
  assert.equal(result.get('nfl:401000002').game.day, '2026-09-16');
});

test('request cancellation cannot be turned into a successful cached refresh', async () => {
  const controller = new AbortController();
  const client = new M.Client(async (url, opts) => { if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError'); return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))); });
  const promise = client.readBoard('nfl', '2026-09-14', '2026-09-14', controller.signal);
  controller.abort();
  await assert.rejects(promise, {name: 'AbortError'}); assert.equal(client.cache.size, 0);
});
