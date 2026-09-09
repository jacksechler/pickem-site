# 2026–27 season and postseason operating plan

This release deploys the calendar and playoff code in **scheduled** mode. It does not create future active weeks, freeze points, change the current card, or start playoffs automatically.

The league has 20 regular-season cards because its first two cards preceded NFL Week 1. All dates below are Eastern Time. January and February dates are in 2027.

| Card | Tuesday setup | Games window | Sports | Deadline / exception |
|---|---|---|---|---|
| Week 1 | Aug 25 | Aug 27–Aug 31 | CFB | Existing card and deadline preserved. |
| Week 2 | Sep 01 | Sep 03–Sep 07 | CFB | Existing card and deadline preserved. |
| Week 3 | Sep 08 | Sep 09–Sep 14 | NFL, CFB | Existing Wednesday NFL opener lock preserved. |
| Week 4 | Sep 15 | Sep 17–Sep 21 | NFL, CFB | TNF lock; only include games starting after lock. |
| Week 5 | Sep 22 | Sep 24–Sep 28 | NFL, CFB | TNF lock; only include games starting after lock. |
| Week 6 | Sep 29 | Oct 01–Oct 05 | NFL, CFB | TNF lock; only include games starting after lock. |
| Week 7 | Oct 06 | Oct 08–Oct 12 | NFL, CFB | TNF lock; only include games starting after lock. |
| Week 8 | Oct 13 | Oct 15–Oct 19 | NFL, CFB | TNF lock; only include games starting after lock. |
| Week 9 | Oct 20 | Oct 22–Oct 26 | NFL, CFB | TNF lock; only include games starting after lock. |
| Week 10 | Oct 27 | Oct 29–Nov 02 | NFL, CFB, CBB | CBB opening games on Monday Nov 2 can join. |
| Week 11 | Nov 03 | Nov 05–Nov 09 | NFL, CFB, CBB | TNF lock; only include games starting after lock. |
| Week 12 | Nov 10 | Nov 12–Nov 16 | NFL, CFB, CBB | TNF lock; only include games starting after lock. |
| Week 13 | Nov 17 | Nov 19–Nov 23 | NFL, CFB, CBB | TNF lock; only include games starting after lock. |
| Week 14 | Nov 24 | Nov 26–Nov 30 | NFL, CFB, CBB | Proposed Thanksgiving 1 p.m. ET lock; Wednesday games excluded unless explicitly reviewed. |
| Week 15 | Dec 01 | Dec 03–Dec 07 | NFL, CFB, CBB | CFB conference championships; regular scoring. |
| Week 16 | Dec 08 | Dec 10–Dec 14 | NFL, CFB, CBB, bowls | Bowl season begins; use games inside this card. |
| Week 17 | Dec 15 | Dec 17–Dec 21 | NFL, CBB, bowls, CFP | CFP first round Dec 18–19. |
| Week 18 | Dec 22 | Dec 24–Dec 28 | NFL, CBB, bowls, CFP | Christmas games and bowls; review start times. |
| Week 19 | Dec 29 | Dec 30–Jan 04 | NFL, CBB, bowls, CFP | Proposed Wednesday 7:30 p.m. ET lock for Fiesta and Jan 1 CFP quarterfinals. |
| Week 20 | Jan 05 | Jan 07–Jan 11 | NFL, CBB | NFL Week 18; no TNF/MNF. CBB can use the Thu–Mon window. |
| Wild Card · 8 → 6 | Jan 12 | Jan 14–18 | NFL, CFP, CBB | Proposed Thu 7:30 p.m. ET lock includes CFP semifinals. NFL games Jan 16–18. |
| Divisional · 6 → 4 | Jan 19 | Jan 21–25 | NFL, CFP, CBB | NFL Jan 23–24; CFP final Monday Jan 25. Review Thursday CBB lock. |
| Conference · 4 → 2 | Jan 26 | Jan 28–Feb 01 | NFL, CBB | NFL Jan 31; review Thursday CBB lock. |
| Championship break | Feb 02 | Feb 04–08 | — | No championship points or extra elimination round. |
| Super Bowl · 2 → 1 | Feb 09 | Feb 11–14 | NFL, CBB | Ends Sunday Feb 14. Review Thursday CBB lock; target 15–25 scored questions. |

## Weekly workflow

1. On Tuesday morning, publish the previous card's completed results.
2. Open **More → Season calendar**, review the games you want, and confirm the next card's lock. Most cards lock at TNF. College games before that lock are excluded unless you explicitly choose an earlier exception.
3. In Commissioner, choose **Create next scheduled week**. The server requires its scheduled Tuesday at 8 a.m. Eastern or later, the preceding card published, and a confirmed future lock. Add that card's questions and tiebreaker prompt normally.
4. Scored games normally run through Monday night. Basketball and bowl games on Tuesday or Wednesday belong outside that card, apart from an explicitly reviewed exception such as Fiesta.

The calendar is a plan, not a live event feed. Times are proposed until confirmed for the selected questions. Existing Weeks 1–3 keep their saved deadlines. The Super Bowl card ends Sunday; February 4–8 is a scoring break.

## Activate and run playoffs

During Tuesday setup on January 12, after all 20 regular cards are published and the Wild Card lock is confirmed, review the starting standings. **Lock Regular Season & Start Playoffs** saves the eight seeds and starting points in one transaction and creates the Wild Card card. No clock job performs this action.

Every correct scored playoff pick adds exactly one point. No regular-season bonuses or placement points carry into playoff scoring. Championship total equals frozen regular-season points plus playoff correct picks earned through elimination. Current-round tiebreaker distance resolves equal totals; frozen seed resolves exact distance ties. Live ties remain tied while the actual result is pending. A missing submission adds zero; a missing tiebreaker ranks behind a supplied one.

At the end of each round, enter every scored result and the actual tiebreaker, choose **Calculate playoff standings**, review the cut, and confirm **Finalize round**. The database saves the round, freezes eliminated totals, and advances 6, then 4, then 2, then one champion. Eliminated members can submit for fun until lock. Only the current 8/6/4/2 contenders count toward early auto-lock.

The final regular-season standings stay frozen on Standings. Playoff state appears on Playoffs, Home, GameDay, profiles, and week history. Regular-season records and bonuses exclude postseason rows.

## Corrections and release verification

Use the playoff correction preview for a finalized round. If any later round exists, an explicit typed rebuild removes those later cards, picks, and results after saving an audit snapshot; recreate the later cards with the corrected survivors. Resetting all playoffs also requires an exact typed confirmation. Ordinary editing and legacy commissioner RPCs cannot alter frozen regular-season results or finalized playoff rounds.

The migration is `database/postseason.sql`. Apply it once through the database migration service before shipping the new client. The release checks compile all loaded scripts, validate assets and version consistency, and verify that legacy installer workflows do not duplicate scripts or downgrade the app. PostgreSQL acceptance tests run entirely inside isolated PGlite, without access to the live database.

```sh
node tests/release_check.mjs
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/gameday_model.test.cjs tests/postseason_db.test.mjs
```

Use `@electric-sql/pglite@0.5.8`. The GitHub **Postseason checks** workflow installs that runtime in a temporary directory.

The NFL round dates follow the [official 2026–27 calendar](https://www.nfl.com/news/2026-27-national-football-league-important-dates). CFP dates and the Wednesday/Thursday exceptions follow the [official CFP broadcast schedule](https://collegefootballplayoff.com/news/2026/6/1/26-27-broadcast-sked). The November 2 CBB opener is supported by [UTRGV's published season schedule](https://goutrgv.com/news/2026/8/14/mens-basketball-announces-full-2026-27-schedule-season-opens-nov-2.aspx).
