import '../../../live_scores_model.js';
import '../../../live_scores_service.js';

// The gateway requires a project JWT. This endpoint returns only public sports
// facts and does not access league questions, picks, accounts or official results.
const Service = (globalThis as any).LiveScoresService;
const base = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': 'https://jacksechler.github.io',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
};
async function cache(path: string, options: RequestInit = {}) {
  const response = await fetch(base + '/rest/v1/live_score_cache' + path, {
    ...options,
    signal: AbortSignal.timeout(5000),
    headers: {apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', ...options.headers},
  });
  if (!response.ok) throw new Error('Score cache unavailable.');
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
const filter = (page: string) => '?source_page=eq.' + encodeURIComponent(page);
const read = Service.create({store: {
  ensure: (page: string, league: string) => cache('?on_conflict=source_page', {method: 'POST', headers: {Prefer: 'resolution=ignore-duplicates'}, body: JSON.stringify({source_page: page, league})}),
  load: async (page: string) => (await cache(filter(page) + '&limit=1'))?.[0],
  claim: async (page: string, now: string, lease: string) => (await cache(filter(page) + '&next_attempt_at=lte.' + encodeURIComponent(now), {method: 'PATCH', headers: {Prefer: 'return=representation'}, body: JSON.stringify({next_attempt_at: lease})}))?.length === 1,
  save: async (page: string, lease: string, row: any) => (await cache(filter(page) + '&next_attempt_at=eq.' + encodeURIComponent(lease), {method: 'PATCH', headers: {Prefer: 'return=representation'}, body: JSON.stringify({games: row.games, fetched_at: row.fetched_at, next_attempt_at: row.next_attempt_at, failure_count: row.failure_count})}))?.length === 1,
}});
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  if (req.method !== 'GET') return respond({error: 'Method not allowed.'}, 405);
  if (!req.headers.get('Authorization')?.startsWith('Bearer ')) return respond({error: 'Authorization required.'}, 401);
  let selected;
  try { selected = Service.input(new URL(req.url)); } catch { return respond({error: 'Invalid scoreboard.'}, 400); }
  try { return respond(await read(selected.key, selected.sourcePage)); }
  catch { return respond({error: 'Score updates are temporarily unavailable.'}, 503); }
});
