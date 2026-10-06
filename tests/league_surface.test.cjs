const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root=path.join(__dirname,'..');
const read=async file=>fs.readFile(path.join(root,file),'utf8');

test('League page source keeps a real share page and explicit entry point',async()=>{
  const html=await read('index.html');
  assert.match(html,/data-page="sharegrid"/);
  assert.match(html,/id="sharegrid"/);
  assert.match(html,/id="shareGridBox"/);
  assert.match(html,/id="leagueShareGrid"/);
  assert.match(html,/renderShareGrid/);
  assert.equal((html.match(/data-page="sharegrid"/g)||[]).length,1);
});

test('League page does not load the conflicting mobile direct-grid wrapper',async()=>{
  const html=await read('index.html');
  assert.equal(html.includes('mobile_direct_grid.js'),false);
  await assert.rejects(fs.access(path.join(root,'mobile_direct_grid.js')));
});

test('weekly standings are not made into a nested fixed-height scroller',async()=>{
  const css=await read('league_scroll_fixes.css');
  const mobileGrid=await read('mobile_grid_fix.js');
  const mobileUx=await read('mobile_ux.css');
  assert.match(css,/#weeklyStandingsV2[\\s\\S]*max-height:\s*none\s*!important/);
  assert.match(css,/#weeklyStandingsV2[\\s\\S]*overflow:\s*visible\s*!important/);
  assert.match(mobileGrid,/\.tablewrap:not\\(#weeklyStandingsV2\\)/);
  assert.match(mobileUx,/\.tablewrap:not\\(#weeklyStandingsV2\\)/);
});

test('League uses the full pick matrix while weekly standings remain separate',async()=>{
  const standings=await read('weekly_standings_v2.js');
  const mobileGrid=await read('mobile_grid_fix.js');
  assert.match(standings,/id="weeklyStandingsV2"/);
  assert.match(standings,/weekly-standing-desktop/);
  assert.match(standings,/weekly-standing-mobile/);
  assert.match(mobileGrid,/player names stay visible/);
});

test('Share Grid has a runtime retry and is callable directly',async()=>{
  const share=await read('share_grid.js');
  assert.match(share,/window\.renderShareGrid=renderShare/);
  assert.match(share,/shareGridRetry/);
  assert.match(share,/Could not load the Share Grid/);
});

test('Path to the Win has exact tiebreaker handling and a visible threshold state',async()=>{
  const pathToWin=await read('path_to_win.js');
  assert.match(pathToWin,/if\(winners\.length===1\) return/);
  assert.match(pathToWin,/Exact scenario checking opens when 4 or fewer remain/);
});

test('mobile and share scripts are loaded in a stable order',async()=>{
  const html=await read('index.html');
  const idx=p=>html.indexOf(p);
  assert.ok(idx('weekly_standings_v2.js')>0);
  assert.ok(idx('path_to_win.js')>idx('weekly_standings_v2.js'));
  assert.ok(idx('redesign.js')>idx('path_to_win.js'));
  assert.ok(idx('share_grid.js')>idx('redesign.js'));
  assert.ok(idx('league_scroll_fixes.css')>idx('mobile_polish.css'));
  assert.ok(idx('league_scroll_fixes.css')>idx('share_grid.css'));
});
