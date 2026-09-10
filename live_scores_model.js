// Read-only CBS Sports adapter. Decode public scoreboard data; never execute page scripts.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveScoresModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const leagues = Object.freeze({
    nfl: {sport: 'football', label: 'NFL', page: 'nfl', prefix: 'NFL'},
    'college-football': {sport: 'football', label: 'CFB', page: 'college-football', prefix: 'NCAAF'},
    'mens-college-basketball': {sport: 'basketball', label: 'CBB', page: 'college-basketball', prefix: 'NCAAB'}
  });
  const text = value => typeof value === 'string' ? value.slice(0, 160) : '';
  const normalize = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const day = value => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'}).format(d) : null;
  };
  function league(value) {
    const key = String(value || '').toLowerCase();
    const aliases = {cfb: 'college-football', bowls: 'college-football', cfp: 'college-football', cbb: 'mens-college-basketball', ncaaf: 'college-football', ncaam: 'mens-college-basketball'};
    return Object.hasOwn(leagues, key) ? key : Object.hasOwn(aliases, key) ? aliases[key] : null;
  }
  function safeLogo(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'sports.cbsimg.net' && /^\/fly\/images\/team-logos\/alt\/\d+\.svg$/.test(u.pathname) && !u.search && !u.username && !u.password ? u.href : ''; } catch { return ''; }
  }
  function safePage(value, key) {
    try { const u = new URL(value); return league(key) && u.origin === 'https://www.cbssports.com' && !u.search && !u.hash && !u.username && !u.password && new RegExp('^/' + leagues[league(key)].page + '/scoreboard/(?:(?:all/)?(?:[0-9]{8}|[0-9]{4}/(?:regular|postseason|preseason)/[0-9]{1,2})/)?$').test(u.pathname) ? u.href : ''; } catch { return ''; }
  }
  function score(value) {
    const raw = typeof value === 'object' && value ? value.displayValue ?? value.value : value;
    return raw !== '' && raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null;
  }
  function event(raw, selectedLeague, sourcePage = '') {
    const key = league(selectedLeague), id = String(raw?.id || ''), abbr = String(raw?.abbr || raw?.gameAbbr || '');
    if (!key || !/^\d{1,15}$/.test(id) || !new RegExp('^' + leagues[key].prefix + '_[0-9]{8}_[A-Z0-9.-]+@[A-Z0-9.-]+$').test(abbr)) return null;
    const epoch = Number(raw.scheduled_epoch), date = new Date(epoch * 1000);
    if (!epoch || !Number.isFinite(date.getTime())) return null;
    const gs = raw.game_status || {}, statusName = text(raw.status).toUpperCase();
    const period = Number(gs.quarter ?? gs.period) || null;
    const state = /CANCEL|POSTPON|SUSPEND|DELAY|ABANDON/.test(statusName) ? 'paused' : /FINAL|COMPLETED|CLOSED/.test(statusName) ? 'final' : /IN.?PROGRESS|LIVE|HALFTIME/.test(statusName) ? 'live' : /^(SCHEDULED|RESCHEDULED|PREGAME)$/.test(statusName) ? 'scheduled' : 'paused';
    const clock = state === 'live' ? text(gs.time_remaining) : '';
    const periodLabel = !period ? '' : leagues[key].sport === 'football' ? period > 4 ? 'OT' + (period > 5 ? ' ' + (period - 4) : '') : 'Q' + period : period > 2 ? 'OT' + (period > 3 ? ' ' + (period - 2) : '') : period === 1 ? '1st half' : '2nd half';
    const teams = ['away', 'home'].map(side => {
      const t = raw[side + 'team'] || {}, teamId = String(t.id || t.teamId || '');
      if (!/^\d+$/.test(teamId) || !t.name) return null;
      return {id: teamId, name: text(t.name), shortName: text(t.mediumname || t.nickname || t.name), abbreviation: text(t.abbr || t.shortname), homeAway: side, logo: 'https://sports.cbsimg.net/fly/images/team-logos/alt/' + teamId + '.svg', score: state === 'scheduled' || (state === 'paused' && !period) ? null : score(gs[side + 'score']?.total ?? raw[side + 'TeamScore']), aliases: [...new Set([t.name, t.mediumname, t.nickname, t.location, t.abbr, t.shortname].map(normalize).filter(Boolean))]};
    });
    if (teams.some(t => !t) || teams[0].id === teams[1].id) return null;
    const status = state === 'final' ? 'Final' + (period && period > (key === 'mens-college-basketball' ? 2 : 4) ? ' / OT' : '') : statusName === 'HALFTIME' ? 'Halftime' : state === 'live' ? [clock, periodLabel].filter(Boolean).join(' · ') || 'Live' : state === 'scheduled' ? 'Scheduled' : statusName ? statusName.toLowerCase().replaceAll('_', ' ').replace(/^./, s => s.toUpperCase()) : 'Update pending';
    return {id, abbr, provider: 'cbs', league: key, date: date.toISOString(), day: day(date), name: teams.map(t => t.name).join(' at '), state, status, clock, period, teams, sourcePage: safePage(sourcePage, key), url: 'https://www.cbssports.com/' + leagues[key].page + '/gametracker/live/' + abbr + '/'};
  }
  function extractState(html) {
    if (typeof html !== 'string' || html.length > 16000000) throw new Error('Score feed unavailable.');
    const match = html.match(/define\(\s*['"]reduxPreloadedState['"][\s\S]*?JSON\.parse\(\s*atob\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/);
    if (!match) throw new Error('Score feed unavailable.');
    const bytes = Uint8Array.from(atob(match[1]), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function sourcePageFor(config, key) {
    if (key === 'mens-college-basketball' && /^\d{8}$/.test(config.date || '')) return 'https://www.cbssports.com/college-basketball/scoreboard/all/' + config.date + '/';
    if (/^\d{4}$/.test(config.year || '') && /^(regular|postseason|preseason)$/.test(config.season || '') && /^\d{1,2}$/.test(String(config.week))) return 'https://www.cbssports.com/' + leagues[key].page + '/scoreboard/all/' + config.year + '/' + config.season + '/' + config.week + '/';
    return '';
  }
  function board(raw, key, sourcePage = '') {
    key = league(key);
    if (!key || !Array.isArray(raw?.games) || raw.config?.arena !== leagues[key].page) throw new Error('Score feed unavailable.');
    const page = sourcePageFor(raw.config, key) || sourcePage;
    return raw.games.map(e => event(e, key, page)).filter(Boolean);
  }
  function boardUrls(key, from, to) {
    key = league(key);
    if (!key || !validDay(from) || !validDay(to) || to < from || Date.parse(to) - Date.parse(from) > 14 * 86400000) throw new Error('Choose a game window of up to 15 days.');
    const urls = new Set(), base = 'https://www.cbssports.com/' + leagues[key].page + '/scoreboard/all/';
    for (let value = Date.parse(from); value <= Date.parse(to); value += 86400000) {
      const d = new Date(value), date = d.toISOString().slice(0, 10);
      if (key === 'mens-college-basketball') { urls.add(base + date.replaceAll('-', '') + '/'); continue; }
      const year = d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0);
      const september = new Date(Date.UTC(year, 8, 1));
      const firstMonday = 1 + (8 - september.getUTCDay()) % 7;
      const openingTuesday = Date.UTC(year, 8, firstMonday + 1);
      const nflWeek = Math.floor((value - openingTuesday) / (7 * 86400000)) + 1;
      if (key === 'nfl' && nflWeek >= 1 && nflWeek <= 23) urls.add(base + year + '/' + (nflWeek > 18 ? 'postseason/' : 'regular/') + nflWeek + '/');
      if (key === 'college-football') {
        const cfbWeek = nflWeek + 1;
        if (cfbWeek >= 0 && cfbWeek <= 15) urls.add(base + year + '/regular/' + cfbWeek + '/');
        if (cfbWeek >= 16 && cfbWeek <= 22) {
          // Army–Navy can share a date with the first bowl games.
          if (cfbWeek === 16) urls.add(base + year + '/regular/16/');
          urls.add(base + year + '/postseason/' + cfbWeek + '/');
        }
      }
    }
    return [...urls];
  }
  function matches(question, games) {
    const opts = question?.answer_options;
    if (!Array.isArray(opts) || opts.length !== 2 || opts.some(o => typeof o !== 'string')) return [];
    const names = opts.map(normalize);
    if (!names[0] || names[0] === names[1]) return [];
    const found = games.filter(g => (g.teams[0].aliases.includes(names[0]) && g.teams[1].aliases.includes(names[1])) || (g.teams[1].aliases.includes(names[0]) && g.teams[0].aliases.includes(names[1])));
    const sameLeague = found.filter(g => g.league === league(question.sport));
    return sameLeague.length ? sameLeague : found;
  }
  function link(question) {
    const value = question?.team_meta?.live_score, key = league(value?.league), id = String(value?.id || '');
    const sourcePage = safePage(value?.sourcePage, key);
    return value?.provider === 'cbs' && key && /^\d{1,15}$/.test(id) && validDay(value.day) && sourcePage ? {provider: 'cbs', id, league: key, day: value.day, sourcePage} : null;
  }
  function metadata(question, game) {
    const meta = question?.team_meta && typeof question.team_meta === 'object' && !Array.isArray(question.team_meta) ? {...question.team_meta} : {};
    if (!game) { delete meta.live_score; return meta; }
    const value = {provider: 'cbs', id: game.id, league: game.league, day: game.day, sourcePage: game.sourcePage};
    if (!link({team_meta: {live_score: value}})) throw new Error('Choose a valid CBS Sports game.');
    meta.live_score = value;
    return meta;
  }
  function windowFor(week, slot) {
    const lockDay = day(week?.lock_at);
    const from = validDay(slot?.starts_on) ? (lockDay && lockDay < slot.starts_on ? lockDay : slot.starts_on) : lockDay;
    if (!from) throw new Error('Set the week deadline first.');
    const d = new Date(from + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + (8 - d.getUTCDay()) % 7);
    const to = validDay(slot?.ends_on) ? slot.ends_on : d.toISOString().slice(0, 10);
    return {from, to: to < from ? from : to};
  }
  class Client {
    constructor(fetcher = globalThis.fetch.bind(globalThis), now = Date.now) { this.fetcher = fetcher; this.now = now; this.cache = new Map(); this.lastGames = new Map(); }
    async read(url, parse, signal, force = false) {
      const previous = this.cache.get(url), now = this.now();
      if (!force && previous && now < previous.expires) return previous.value;
      const controller = new AbortController(), abort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      signal?.addEventListener('abort', abort, {once: true});
      const timer = setTimeout(abort, 20000);
      try {
        const response = await this.fetcher(url, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'});
        if (!response.ok) throw new Error('Score feed unavailable.');
        const games = parse(extractState(await response.text()));
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const checkedAt = this.now(), value = {games, checkedAt, stale: false};
        games.forEach(game => this.lastGames.set(game.league + ':' + game.id, {game, checkedAt}));
        const active = games.some(g => g.state === 'live' || (g.state === 'scheduled' && Date.parse(g.date) - checkedAt < 15 * 60000));
        this.cache.set(url, {value, expires: checkedAt + (active ? 30000 : 120000)});
        return value;
      } catch (error) {
        if (signal?.aborted) throw error;
        const value = {games: previous?.value.games || [], checkedAt: previous?.value.checkedAt || null, stale: true};
        // Brief backoff; retain the last confirmed scores without inventing zeros.
        this.cache.set(url, {value, expires: this.now() + 30000});
        return value;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
    readPage(key, url, signal, force = false) {
      key = league(key);
      if (!safePage(url, key)) throw new Error('Invalid score source.');
      return this.read(url, raw => board(raw, key, url), signal, force);
    }
    async readBoard(key, from, to, signal, force = false) {
      const urls = boardUrls(key, from, to), pages = [];
      // Bound daily CBB requests, including the two-week semifinal card.
      for (let i = 0; i < urls.length; i += 3) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        pages.push(...await Promise.all(urls.slice(i, i + 3).map(url => this.readPage(key, url, signal, force))));
      }
      const games = [...new Map(pages.flatMap(p => p.games).filter(g => g.day >= from && g.day <= to).map(g => [g.id, g])).values()].sort((a, b) => a.date.localeCompare(b.date));
      const stamps = pages.map(p => p.checkedAt).filter(Boolean);
      return {games, checkedAt: stamps.length ? Math.min(...stamps) : null, stale: pages.some(p => p.stale)};
    }
    async readLinks(questions, signal, force = false) {
      const links = [...new Map(questions.map(link).filter(Boolean).map(l => [l.league + ':' + l.id, l])).values()];
      const groups = new Map(), results = new Map(), missing = new Map();
      for (const item of links) {
        if (!groups.has(item.sourcePage)) groups.set(item.sourcePage, {league: item.league, links: []});
        groups.get(item.sourcePage).links.push(item);
      }
      const entries = [...groups];
      for (let i = 0; i < entries.length; i += 3) await Promise.all(entries.slice(i, i + 3).map(async ([url, group]) => {
        const page = await this.readPage(group.league, url, signal, force);
        for (const item of group.links) {
          const key = item.league + ':' + item.id, game = page.games.find(g => g.id === item.id);
          if (game) results.set(key, {key, game, stale: page.stale, checkedAt: page.checkedAt});
          else {
            if (!missing.has(item.league)) missing.set(item.league, []);
            missing.get(item.league).push(item);
          }
        }
      }));
      // A postponed game may move to the current scoreboard. Only follow its stable ID.
      await Promise.all([...missing].map(async ([key, items]) => {
        const page = await this.readPage(key, 'https://www.cbssports.com/' + leagues[key].page + '/scoreboard/', signal, force);
        for (const item of items) {
          const id = key + ':' + item.id, game = page.games.find(g => g.id === item.id), previous = this.lastGames.get(id);
          results.set(id, {key: id, game: game || previous?.game || null, stale: game ? page.stale : true, checkedAt: game ? page.checkedAt : previous?.checkedAt || null});
        }
      }));
      return results;
    }
  }
  return {leagues, league, normalize, validDay, day, safeLogo, safePage, event, extractState, board, boardUrls, matches, link, metadata, windowFor, Client};
});
