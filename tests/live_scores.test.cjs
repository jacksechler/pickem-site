const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../live_scores_model.js');
const fixtures = require('./fixtures/cbs-scoreboards.json');
const page = 'https://www.cbssports.com/nfl/scoreboard/all/2026/regular/1/';
function fixture({id = '50029202', date = '2026-09-15T00:15:00Z', status = 'SCHEDULED', score = '0'} = {}) {
  const game = structuredClone(fixtures.nfl.games[0]);
  Object.assign(game, {id, scheduled_epoch: Date.parse(date) / 1000, status});
  game.game_status = {quarter: '3', time_remaining: '8:31', awayscore: {total: '10'}, homescore: {total: score}};
  game.unused = 'NOT FOR DISPLAY';
  return game;
}
const state = (games, week = '1') => ({config: {...fixtures.nfl.config, week}, games});
const html = data => '<script>throw new Error("DO NOT EXECUTE"); define(\'reduxPreloadedState\', [], function() { return JSON.parse(atob(\'' + Buffer.from(JSON.stringify(data)).toString('base64') + '\')); });</script>';
const response = data => ({ok: true, text: async () => html(data)});
const connected = (id, sourcePage = page) => ({team_meta: {live_score: {provider: 'cbs', id, league: 'nfl', day: '2026-09-14', sourcePage}}});

test('public NFL, CFB and CBB data normalizes without executing scripts or retaining unrelated fields', () => {
  for (const [key, data] of Object.entries(fixtures)) {
    const games = M.board(M.extractState(html(data)), key);
    assert.equal(games.length, 1); assert.equal(games[0].provider, 'cbs');
    assert.ok(games[0].sourcePage.startsWith('https://www.cbssports.com/'));
    assert.ok(games[0].teams.every(t => t.name && M.safeLogo(t.logo)));
  }
  assert.throws(() => M.extractState('<script>window.alert(1)</script>'));
  assert.throws(() => M.board(fixtures.nfl, 'CFB'));
  assert.ok(!JSON.stringify(M.event(fixture(), 'nfl')).includes('NOT FOR DISPLAY'));
});

test('scheduled teams have no invented 0–0 score and game days use Eastern time', () => {
  const game = M.event(fixture(), 'nfl', page);
  assert.deepEqual(game.teams.map(t => t.score), [null, null]);
  assert.equal(game.day, '2026-09-14');
  assert.equal(game.url, 'https://www.cbssports.com/nfl/gametracker/live/NFL_20260909_NE@SEA/');
  assert.equal(M.event(fixture({status: 'RESCHEDULED'}), 'nfl').state, 'scheduled');
});

test('live clocks, zero scores, finals, halftime and delayed games stay distinct', () => {
  const live = M.event(fixture({status: 'INPROGRESS'}), 'nfl');
  assert.equal(live.state, 'live'); assert.equal(live.status, '8:31 · Q3'); assert.equal(live.teams[1].score, 0);
  assert.equal(M.event(fixture({status: 'FINAL'}), 'nfl').state, 'final');
  assert.equal(M.event(fixture({status: 'HALFTIME'}), 'nfl').status, 'Halftime');
  for (const status of ['POSTPONED', 'CANCELLED', 'DELAYED', 'TBA']) assert.equal(M.event(fixture({status}), 'nfl').state, 'paused');
  const cbb = structuredClone(fixtures['mens-college-basketball'].games[0]);
  Object.assign(cbb, {status: 'INPROGRESS', game_status: {period: '2', time_remaining: '4:20'}});
  assert.equal(M.event(cbb, 'CBB').status, '4:20 · 2nd half');
});

test('source URLs reject unrelated domains, scripts, credentials and cross-sport paths', () => {
  for (const value of ['https://www.espn.com/nfl/scoreboard/', 'javascript:alert(1)', page + '?redirect=1', page.replace('www.cbssports.com', 'www.cbssports.com.evil.example'), page.replace('www.', 'user@www.')]) assert.equal(M.safePage(value, 'nfl'), '');
  assert.equal(M.safePage(page, 'CFB'), '');
  assert.equal(M.safeLogo('https://a.espncdn.com/i/teamlogos/sea.png'), '');
  assert.equal(M.event({...fixture(), abbr: 'NFL_20260909_NE@SEA/evil'}, 'nfl'), null);
});

test('team matching handles reversed order and leaves uncertain questions for review', () => {
  const games = [M.event(fixture(), 'nfl', page)], q = {sport: 'NFL', answer_options: ['Seahawks', 'Patriots']};
  assert.equal(M.matches(q, games).length, 1);
  assert.equal(M.matches({...q, answer_options: ['Seattle', 'NE']}, games).length, 1);
  assert.equal(M.matches(q, [...games, M.event(fixture({id: '50029203'}), 'nfl')]).length, 2);
  assert.equal(M.matches({...q, answer_options: ['Yes', 'No']}, games).length, 0);
  assert.equal(M.matches({...q, answer_options: ['Seahawks (bonus)', 'Patriots']}, games).length, 0);
});

test('date routing covers NFL playoffs, regular CFB, bowls, CFP and daily CBB', () => {
  for (const key of ['CFB', 'Bowls', 'CFP']) assert.equal(M.league(key), 'college-football');
  for (const key of ['other', 'toString', 'constructor', '__proto__']) assert.equal(M.league(key), null);
  assert.deepEqual(M.boardUrls('NFL', '2026-09-09', '2026-09-14'), [page]);
  assert.ok(M.boardUrls('NFL', '2027-01-14', '2027-01-18')[0].endsWith('/2026/postseason/19/'));
  assert.ok(M.boardUrls('NFL', '2027-02-14', '2027-02-14')[0].endsWith('/2026/postseason/23/'));
  assert.ok(M.boardUrls('CFB', '2026-09-10', '2026-09-14')[0].endsWith('/2026/regular/2/'));
  assert.deepEqual(M.boardUrls('CFB', '2025-12-13', '2025-12-13').map(u => u.split('/2025/')[1]), ['regular/16/', 'postseason/16/']);
  assert.ok(M.boardUrls('CFP', '2026-01-19', '2026-01-19')[0].endsWith('/2025/postseason/21/'));
  assert.equal(M.boardUrls('CBB', '2027-01-28', '2027-02-08').length, 12);
  assert.ok(M.boardUrls('CBB', '2026-11-02', '2026-11-02')[0].endsWith('/all/20261102/'));
  assert.throws(() => M.boardUrls('nfl', '2026-09-31', '2026-10-01'));
  assert.throws(() => M.boardUrls('nfl', '2026-01-01', '2026-02-01'));
});

test('week range preserves the Wednesday opener, Monday night and extended semifinals', () => {
  assert.deepEqual(M.windowFor({lock_at: '2026-09-10T00:20:00Z'}, {starts_on: '2026-09-10', ends_on: '2026-09-14'}), {from: '2026-09-09', to: '2026-09-14'});
  assert.deepEqual(M.windowFor({lock_at: '2027-01-29T01:15:00Z'}, {starts_on: '2027-01-28', ends_on: '2027-02-08'}), {from: '2027-01-28', to: '2027-02-08'});
  assert.equal(M.windowFor({lock_at: '2026-09-11T00:20:00Z'}).to, '2026-09-14');
});

test('connections preserve other metadata and never use legacy ESPN fields', () => {
  const q = {team_meta: {color: 'blue'}, espn_event_id: '401000001', espn_league: 'nfl', espn_event_date: '2026-09-14'};
  assert.equal(M.link(q), null);
  const meta = M.metadata(q, M.event(fixture(), 'nfl', page));
  assert.equal(meta.color, 'blue'); assert.equal(meta.live_score.provider, 'cbs');
  assert.equal(M.link({team_meta: meta}).id, '50029202');
  assert.deepEqual(M.metadata({team_meta: meta}, null), {color: 'blue'});
  assert.deepEqual(q.team_meta, {color: 'blue'});
  assert.throws(() => M.metadata(q, {id: 'bad'}));
});

test('cache limits refreshes and retains last confirmed scores through failures', async () => {
  let now = Date.parse('2026-09-15T01:00:00Z'), calls = 0, fails = false;
  const client = new M.Client(async (url, options) => {
    calls++; assert.ok(url.startsWith('https://www.cbssports.com/')); assert.equal(options.credentials, 'omit');
    if (fails) throw new Error('network');
    return response(state([fixture({status: 'INPROGRESS', score: '13'})]));
  }, () => now);
  const first = await client.readBoard('nfl', '2026-09-14', '2026-09-14');
  assert.equal(first.games[0].teams[1].score, 13); assert.equal(calls, 1);
  await client.readBoard('nfl', '2026-09-14', '2026-09-14'); assert.equal(calls, 1);
  now += 31000; fails = true;
  const stale = await client.readBoard('nfl', '2026-09-14', '2026-09-14');
  assert.equal(stale.stale, true); assert.equal(stale.checkedAt, first.checkedAt); assert.equal(stale.games[0].teams[1].score, 13);
  await client.readBoard('nfl', '2026-09-14', '2026-09-14'); assert.equal(calls, 2);
  now += 31000; fails = false;
  assert.equal((await client.readBoard('nfl', '2026-09-14', '2026-09-14')).stale, false);
});

test('invalid provider payloads show unavailable without a score', async () => {
  const client = new M.Client(async () => response({error: 'Unavailable'}));
  const read = await client.readBoard('nfl', '2026-09-14', '2026-09-14');
  assert.equal(read.stale, true); assert.deepEqual(read.games, []); assert.equal(read.checkedAt, null);
});

test('linked games share a weekly request and moved games follow their stable ID', async () => {
  const calls = [];
  const client = new M.Client(async url => {
    calls.push(url);
    return response(url === page ? state([fixture()]) : state([fixture({id: '50029203', date: '2026-09-16T23:00:00Z'})], '2'));
  });
  const result = await client.readLinks(['50029202', '50029203', '50029202'].map(id => connected(id)));
  assert.equal(calls.length, 2); assert.equal(result.size, 2);
  assert.equal(result.get('nfl:50029203').game.day, '2026-09-16');
  assert.ok(calls.every(url => new URL(url).hostname === 'www.cbssports.com'));
});

test('a removed event retains its last score marked delayed', async () => {
  let removed = false;
  const client = new M.Client(async () => response(state(removed ? [] : [fixture({status: 'INPROGRESS', score: '13'})])));
  await client.readLinks([connected('50029202')]); removed = true;
  const result = (await client.readLinks([connected('50029202')], undefined, true)).get('nfl:50029202');
  assert.equal(result.stale, true); assert.equal(result.game.teams[1].score, 13);
});

test('cancellation cannot become a successful cached refresh', async () => {
  const controller = new AbortController();
  const client = new M.Client(async (url, opts) => { if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError'); return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))); });
  const promise = client.readBoard('nfl', '2026-09-14', '2026-09-14', controller.signal);
  controller.abort();
  await assert.rejects(promise, {name: 'AbortError'}); assert.equal(client.cache.size, 0);
});

const Service = require('../live_scores_service.js');
function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async ensure(source_page, league) { if (!rows.has(source_page)) rows.set(source_page, {source_page, league, games: [], fetched_at: null, next_attempt_at: '1970-01-01T00:00:00Z', failure_count: 0}); },
    async load(url) { return structuredClone(rows.get(url)); },
    async claim(url, now, lease) { const row=rows.get(url); if (Date.parse(row.next_attempt_at)>Date.parse(now)) return false; row.next_attempt_at=lease; return true; },
    async save(url, lease, value) { if (rows.get(url).next_attempt_at!==lease) return false; rows.set(url, structuredClone(value)); return true; }
  };
}
const scorePacket = (games, checkedAt, stale = false) => ({schema: 1, provider: 'cbs', league: 'nfl', sourcePage: page, games, checkedAt, stale});

test('scores survive a full page reload and a failed refresh without claiming a fresh update', async () => {
  const storage = new Map(), disk = {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v)};
  let now = Date.parse('2026-09-15T01:00:00Z');
  const first = new M.Client(undefined, () => now, {storage: () => disk, reader: async () => scorePacket([M.event(fixture({status:'INPROGRESS',score:'13'}),'nfl',page)], now)});
  await first.readLinks([connected('50029202')]);
  now += 60000;
  const reloaded = new M.Client(undefined, () => now, {storage: () => disk, reader: async () => { throw new Error('offline'); }});
  const saved = reloaded.peek(M.link(connected('50029202')));
  assert.equal(saved.game.teams[1].score,13); assert.equal(saved.stale,true);
  const result = (await reloaded.readLinks([connected('50029202')])).get('nfl:50029202');
  assert.equal(result.game.teams[1].score,13); assert.equal(result.checkedAt,now-60000); assert.equal(result.stale,true);
});

test('bad storage and forged score packets cannot inject score markup or unrelated URLs', async () => {
  const bad = new M.Client(undefined, Date.now, {storage:()=>({getItem:()=>'{bad'})});
  assert.equal(bad.cache.size,0);
  const game=M.event(fixture({status:'INPROGRESS'}),'nfl',page);
  game.teams[0].score='<img src=x onerror=alert(1)>'; game.url='https://evil.example';
  const clean=M.packet(scorePacket([game],Date.now()),'nfl',page).games[0];
  assert.equal(clean.teams[0].score,null); assert.ok(clean.url.startsWith('https://www.cbssports.com/'));
  assert.throws(()=>M.packet({...scorePacket([game],Date.now()),league:'CFB'},'nfl',page));
});

test('a delayed server response does not overwrite a newer browser snapshot', async () => {
  const now=Date.parse('2026-09-15T01:00:00Z'), game=M.event(fixture({status:'INPROGRESS',score:'13'}),'nfl',page);
  let old=false;
  const client=new M.Client(undefined,()=>now,{reader:async()=>scorePacket(old?[]:[game],old?now-60000:now,old)});
  await client.readLinks([connected('50029202')]); old=true;
  const item=(await client.readLinks([connected('50029202')],undefined,true)).get('nfl:50029202');
  assert.equal(item.game.teams[1].score,13); assert.equal(item.checkedAt,now); assert.equal(item.stale,true);
});

test('server cache survives a worker restart, backs off failures, and recovers', async () => {
  const store=memoryStore(); let now=Date.parse('2026-09-15T01:00:00Z'), calls=0, fail=false;
  const fetcher=async()=>{calls++;if(fail===true)throw new Error('provider timeout');return response(state(fail==='empty'?[]:[fixture({status:'INPROGRESS',score:'13'})]));};
  let read=Service.create({store,fetcher,now:()=>now});
  const first=await read('nfl',page);assert.equal(first.stale,false);assert.equal(calls,1);
  read=Service.create({store,fetcher,now:()=>now});await read('nfl',page);assert.equal(calls,1);
  now+=31000;fail=true;
  const stale=await read('nfl',page);assert.equal(stale.stale,true);assert.equal(stale.checkedAt,first.checkedAt);assert.equal(stale.games[0].teams[1].score,13);
  await read('nfl',page);assert.equal(calls,2);
  now+=31000;fail=false;assert.equal((await read('nfl',page)).stale,false);assert.equal(calls,3);
  now+=31000;fail='empty';const empty=await read('nfl',page);assert.equal(empty.stale,true);assert.equal(empty.games[0].teams[1].score,13);
});

test('concurrent members share one provider refresh and expired leases cannot overwrite newer data', async () => {
  const store=memoryStore(), now=Date.parse('2026-09-15T01:00:00Z');let calls=0;
  const read=Service.create({store,now:()=>now,fetcher:async()=>{calls++;return response(state([fixture()]));}});
  await Promise.all(Array.from({length:8},()=>read('nfl',page)));
  assert.equal(calls,1);assert.equal(store.rows.get(page).games.length,1);
  assert.equal(await store.save(page,'expired',{games:[]}),false);
  assert.equal(store.rows.get(page).games.length,1);
});

test('server only accepts public CBS scoreboards and refuses other targets', () => {
  const url=new URL('https://scores.example/?'+new URLSearchParams({league:'nfl',page}));
  assert.deepEqual(Service.input(url),{key:'nfl',sourcePage:page});
  url.searchParams.set('page','http://169.254.169.254/');assert.throws(()=>Service.input(url));
  url.searchParams.set('page',page);url.searchParams.set('token','unwanted');assert.throws(()=>Service.input(url));
});
