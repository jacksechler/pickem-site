// Server-only score cache. No league records or user data are read or written.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./live_scores_model.js'));
  else root.LiveScoresService = factory(root.LiveScoresModel);
})(typeof globalThis === 'object' ? globalThis : this, function(M) {
  'use strict';
  const ttl = (games, now) => games.some(g => g.state === 'live' || (g.state === 'scheduled' && Date.parse(g.date) < now + 900000)) ? 30000 : 120000;
  function input(url) {
    const key = M.league(url.searchParams.get('league'));
    const sourcePage = M.safePage(url.searchParams.get('page'), key);
    if (!key || !sourcePage || [...url.searchParams.keys()].some(k => !['league', 'page'].includes(k))) throw new Error('Invalid scoreboard.');
    return {key, sourcePage};
  }
  function create({store, fetcher = globalThis.fetch.bind(globalThis), now = Date.now}) {
    function result(row, key, sourcePage) {
      const checkedAt = row?.fetched_at ? Date.parse(row.fetched_at) : null, games = row?.games || [];
      return {schema: 1, provider: 'cbs', league: key, sourcePage, games, checkedAt, stale: !checkedAt || !!row.failure_count || now() - checkedAt > ttl(games, now())};
    }
    return async function read(key, sourcePage) {
      if (!M.safePage(sourcePage, key)) throw new Error('Invalid scoreboard.');
      await store.ensure(sourcePage, key);
      let row = await store.load(sourcePage);
      if (Date.parse(row.next_attempt_at) > now()) return result(row, key, sourcePage);
      const lease = new Date(now() + 18000).toISOString();
      if (!await store.claim(sourcePage, new Date(now()).toISOString(), lease)) return result(await store.load(sourcePage), key, sourcePage);
      try {
        const response = await fetcher(sourcePage, {signal: AbortSignal.timeout(12000), redirect: 'error', headers: {Accept: 'text/html'}, credentials: 'omit'});
        if (!response.ok || Number(response.headers?.get('content-length')) > 16000000) throw new Error('Provider unavailable.');
        const games = M.board(M.extractState(await response.text()), key, sourcePage);
        if (!games.length && row.games.length) throw new Error('Incomplete score update.');
        const checkedAt = now();
        row = {...row, games, fetched_at: new Date(checkedAt).toISOString(), next_attempt_at: new Date(checkedAt + ttl(games, checkedAt)).toISOString(), failure_count: 0};
        const saved = await store.save(sourcePage, lease, row);
        return result(saved ? row : await store.load(sourcePage), key, sourcePage);
      } catch {
        const failure_count = Math.min((row.failure_count || 0) + 1, 10);
        row = {...row, failure_count, next_attempt_at: new Date(now() + Math.min(300000, 30000 * 2 ** (failure_count - 1))).toISOString()};
        try { await store.save(sourcePage, lease, row); } catch { /* Keep the successful snapshot even during a cache outage. */ }
        return {...result(row, key, sourcePage), stale: true};
      }
    };
  }
  return {create, input};
});
