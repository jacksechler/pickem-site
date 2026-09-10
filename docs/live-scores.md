# ESPN live scores

Members can open **Live game scores** on Home, see the current game alongside a question in My picks, or follow the connected games in GameDay. Scores, team logos, game clocks, final results, and delays come from ESPN. All displayed times use the member’s local time; the commissioner’s game date selector explicitly uses Eastern time.

In **Commissioner → Week setup → Connect live scores**, choose **Find matching games**, review the proposed matchups, then connect them. Only a unique match for both answer options is suggested. The manual picker supports any question and a specific NFL, CFB, or CBB game. The CFB feed includes regular season, bowls, and CFP; the CBB feed includes Division I games. Game connections can be removed or changed before the week is published.

The existing `questions.espn_event_id`, `espn_league`, and `espn_event_date` fields store the connection. Existing commissioner RLS protects updates. No schema migration or API key is needed. Scores are read-only: this feature never writes answers, tiebreakers, pick results, result order, league points, deadlines, or postseason state. Official scoring still uses commissioner-confirmed answers.

The ESPN website’s score endpoints are not a contracted service. Failed responses retain the last successful score with an update-delayed label; the rest of the app keeps working. The adapter only retains game identifiers, team names/logos, scores, and game status. It does not retain or render other feed fields.

Requests are grouped by league and date window. The UI checks every 30 seconds while visible; the cache refreshes active games at 30 seconds and other schedules at two minutes. Hidden tabs and collapsed Home scores stop polling. Requests cancel on navigation; late responses cannot repaint another week. A missing game falls back to its event ID, allowing a postponed game to move outside its original date. Game windows use the season calendar, including the Wednesday opener and the extended semifinal round.

Verification: `node --test tests/live_scores.test.cjs tests/gameday_model.test.cjs` and `node tests/release_check.mjs`. The adapter covers pregame/live/final/paused states, ambiguous matches, midnight timezone boundaries, caching, unavailable feeds, rescheduling, and cancellation. No browser QA was requested.
