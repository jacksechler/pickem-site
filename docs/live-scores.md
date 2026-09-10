# CBS Sports live scores

Members can open **Live game scores** on Home, see the current game in My picks, or follow connected games in GameDay. Scores, team names, clocks and statuses come from CBS Sports through the app's score service. Game links open CBS Sports. Logos use CBS's image host and fall back to team abbreviations when unavailable. Displayed times use each member's local time; the commissioner's game date selector explicitly uses Eastern time.

In **Commissioner → Week setup → Connect live scores**, choose **Find matching games**, review the matchups, then connect them. Only a unique match for both team names is suggested. The manual picker supports NFL, CFB and men's CBB. CFB includes regular season, bowls and CFP. Connections can be changed before the week is published. Existing connections remain in `questions.team_meta.live_score` and retain commissioner RLS protection.

## Reliable delivery

Browsers request small JSON responses from the `live-scores` Supabase Edge Function. They no longer download CBS HTML or depend on CBS's cross-origin response headers. The function decodes public CBS scoreboard JSON without executing page scripts, and retains only ordinary game identifiers, teams, scores, schedules and status. It never requests ESPN.

`live_scores_service.js` shares a persistent `live_score_cache` row per scoreboard. A conditional 18-second lease allows one refresh at a time across workers and league members. Active games refresh at 30 seconds; other schedules at two minutes. Provider failures retain the last successful snapshot and its original timestamp, with retries backing off to five minutes. Expired leases cannot overwrite newer snapshots. A missing event is checked on the current scoreboard by its stable ID; if still missing, the last score stays marked delayed.

The browser also saves up to 40 scoreboard snapshots for seven days. Those scores appear immediately after a page reload, including when an update fails. Corrupt or unavailable storage does not break the app. Older server data cannot replace a newer local snapshot. Delayed scores show their actual last update time, including the date for older updates. CBS's own data can still be delayed; snapshots are never presented as new live results.

The UI checks every 30 seconds while visible. Hidden tabs and collapsed Home scores stop polling. Navigation cancels requests, and late responses cannot repaint another week. Season-calendar routing includes the Wednesday opener, bowls, NFL playoffs and extended semifinals.

## Access and deployment

The score endpoint serves only already-public sports facts; it never reads league questions, picks, accounts, deadlines, standings or official results. The gateway keeps `verify_jwt = true`. The browser sends the existing public project JWT so score delivery does not depend on an expiring member session. No private data is returned. CORS allows the existing GitHub Pages origin, and the service accepts only whitelisted CBS scoreboard paths. CBS redirects are rejected.

The cache table has RLS enabled and all `PUBLIC`, `anon` and `authenticated` table privileges revoked. Only the server's service-role credential can read or write it. The deliberate lack of client RLS policies prevents direct table access; the advisor's corresponding INFO notice is expected. The service-role key is read only from the Edge Function environment and is never included in browser code. No existing policies, score calculations or playoff activation rules are changed.

Deploy the migration and the `live-scores` function before publishing the client. Upload the function entrypoint together with the root `live_scores_model.js` and `live_scores_service.js` files, preserving relative paths. The function imports the same parser tested by the app. Public CBS pages are not a contracted API; parsing or source availability may change.

## Verification

Run `node --test tests/live_scores.test.cjs tests/gameday_model.test.cjs` and `node tests/release_check.mjs`. Tests cover all three sports, source validation, scheduling, matching, cancellation, reloads during outages, malformed storage, stale server responses, worker restarts, concurrent members, refresh leases, backoff and recovery. Deployed endpoint checks cover actual NFL/CFB/CBB data, cross-origin preflight, missing credentials and invalid source URLs. Actual league Wi-Fi still requires a member-device check; no browser QA was requested.
