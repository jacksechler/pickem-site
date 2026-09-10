// Read-only ESPN adapter. Only game identity, teams, scores and status enter the app.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiveScoresModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const leagues = Object.freeze({
    nfl: {sport: 'football', label: 'NFL', page: 'nfl'},
    'college-football': {sport: 'football', label: 'CFB', page: 'college-football', groups: '80'},
    'mens-college-basketball': {sport: 'basketball', label: 'CBB', page: 'mens-college-basketball', groups: '50'}
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
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'a.espncdn.com' && u.pathname.startsWith('/i/teamlogos/') ? u.href : ''; } catch { return ''; }
  }
  function score(value) {
    const raw = typeof value === 'object' && value ? value.displayValue ?? value.value : value;
    return raw !== '' && raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null;
  }
  function event(raw, selectedLeague) {
    const key = league(selectedLeague), competition = raw?.competitions?.[0];
    if (!key || !/^\d{1,15}$/.test(raw?.id || '') || !competition) return null;
    const date = raw.date || competition.date;
    if (!Number.isFinite(Date.parse(date))) return null;
    const status = competition.status || raw.status || {}, type = status.type || {};
    const terminalException = /CANCEL|POSTPON|SUSPEND|DELAY|ABANDON/.test(type.name || '');
    const state = terminalException ? 'paused' : type.completed === true && type.state === 'post' ? 'final' : type.state === 'in' ? 'live' : 'scheduled';
    const teams = (competition.competitors || []).map(c => {
      const t = c.team || {};
      return {id: text(String(t.id || c.id || '')), name: text(t.displayName || t.shortDisplayName || t.name), shortName: text(t.shortDisplayName || t.name || t.displayName), abbreviation: text(t.abbreviation), homeAway: c.homeAway === 'home' ? 'home' : 'away', logo: safeLogo(t.logo || t.logos?.[0]?.href), score: state === 'scheduled' ? null : score(c.score), aliases: [...new Set([t.displayName, t.shortDisplayName, t.name, t.location, t.abbreviation].map(normalize).filter(Boolean))]};
    }).filter(t => t.id && t.name).sort((a, b) => (a.homeAway === 'away' ? 0 : 1) - (b.homeAway === 'away' ? 0 : 1));
    if (teams.length !== 2 || teams[0].id === teams[1].id) return null;
    return {id: String(raw.id), league: key, date: new Date(date).toISOString(), day: day(date), name: text(raw.name) || teams.map(t => t.name).join(' at '), state, status: text(type.shortDetail || type.detail || type.description) || ({live: 'Live', final: 'Final', paused: 'Update pending', scheduled: 'Scheduled'})[state], clock: state === 'live' ? text(status.displayClock) : '', period: Number.isFinite(Number(status.period)) ? Number(status.period) : null, teams, url: 'https://www.espn.com/' + leagues[key].page + '/game/_/gameId/' + raw.id};
  }
  function board(raw, key) {
    if (!Array.isArray(raw?.events)) throw new Error('Score feed unavailable.');
    return raw.events.map(e => event(e, key)).filter(Boolean);
  }
  function boardUrl(key, from, to) {
    key = league(key);
    if (!key || !validDay(from) || !validDay(to) || to < from || Date.parse(to) - Date.parse(from) > 14 * 86400000) throw new Error('Choose a game window of up to 15 days.');
    const params = new URLSearchParams({dates: from.replaceAll('-', '') + '-' + to.replaceAll('-', ''), limit: '1000'});
    if (leagues[key].groups) params.set('groups', leagues[key].groups);
    return 'https://site.api.espn.com/apis/site/v2/sports/' + leagues[key].sport + '/' + key + '/scoreboard?' + params;
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
    const key = league(question?.espn_league), id = String(question?.espn_event_id || '');
    return key && /^\d{1,15}$/.test(id) && validDay(question.espn_event_date) ? {id, league: key, day: question.espn_event_date} : null;
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
    constructor(fetcher = globalThis.fetch.bind(globalThis), now = Date.now) { this.fetcher = fetcher; this.now = now; this.cache = new Map(); }
    async read(url, parse, signal, force = false) {
      const previous = this.cache.get(url), now = this.now();
      if (!force && previous && now < previous.expires) return previous.value;
      const controller = new AbortController(), abort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      signal?.addEventListener('abort', abort, {once: true});
      const timer = setTimeout(abort, 12000);
      try {
        const response = await this.fetcher(url, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
        if (!response.ok) throw new Error('Score feed unavailable.');
        const games = parse(await response.json());
        const checkedAt = this.now(), value = {games, checkedAt, stale: false};
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
    readBoard(key, from, to, signal, force = false) {
      key = league(key);
      return this.read(boardUrl(key, from, to), raw => board(raw, key).filter(g => g.day >= from && g.day <= to), signal, force);
    }
    readEvent(key, id, signal, force = false) {
      key = league(key);
      if (!key || !/^\d{1,15}$/.test(id)) throw new Error('Invalid game.');
      const url = 'https://site.api.espn.com/apis/site/v2/sports/' + leagues[key].sport + '/' + key + '/summary?event=' + id;
      return this.read(url, raw => { const g = event(raw?.header, key); if (!g || g.id !== id) throw new Error('Game unavailable.'); return [g]; }, signal, force);
    }
    async readLinks(questions, signal, force = false) {
      const links = [...new Map(questions.map(link).filter(Boolean).map(l => [l.league + ':' + l.id, l])).values()];
      const groups = new Map();
      for (const item of links) {
        let group = [...groups.values()].find(g => g.league === item.league && Math.max(Date.parse(g.to), Date.parse(item.day)) - Math.min(Date.parse(g.from), Date.parse(item.day)) <= 14 * 86400000);
        if (!group) { group = {league: item.league, from: item.day, to: item.day, links: []}; groups.set(groups.size, group); }
        group.from = group.from < item.day ? group.from : item.day; group.to = group.to > item.day ? group.to : item.day; group.links.push(item);
      }
      const results = await Promise.all([...groups.values()].map(async g => {
        const b = await this.readBoard(g.league, g.from, g.to, signal, force);
        return Promise.all(g.links.map(async l => {
          const game = b.games.find(e => e.id === l.id);
          if (game) return {key: l.league + ':' + l.id, game, stale: b.stale, checkedAt: b.checkedAt};
          // Game IDs survive postponements, even when the game moves outside its original date.
          const detail = await this.readEvent(l.league, l.id, signal, force);
          return {key: l.league + ':' + l.id, game: detail.games[0] || null, stale: detail.stale, checkedAt: detail.checkedAt};
        }));
      }));
      return new Map(results.flat().map(r => [r.key, r]));
    }
  }
  return {leagues, league, normalize, validDay, day, safeLogo, event, board, boardUrl, matches, link, windowFor, Client};
});
