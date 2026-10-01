const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'mobile_polish.css'),'utf8');
const postseason=fs.readFileSync(path.join(root,'postseason.js'),'utf8');
const redesign=fs.readFileSync(path.join(root,'redesign.js'),'utf8');
const gameday=fs.readFileSync(path.join(root,'gameday.js'),'utf8');

test('mobile polish loads after core page styles',()=>{
  const live=html.indexOf('live_scores.css');
  const mobile=html.indexOf('mobile_polish.css');
  assert.ok(live>=0 && mobile>live,'mobile_polish.css should load after the other feature styles');
});

test('iPhone form zoom and safe areas are handled',()=>{
  assert.match(css,/:is\(input, select, textarea\) \{ font-size: 16px; \}/);
  assert.match(css,/env\(safe-area-inset-top\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/100dvh/);
});

test('phone navigation and touch targets stay usable',()=>{
  assert.match(css,/grid-template-columns: repeat\(6, minmax\(48px, 1fr\)\)/);
  assert.match(css,/:is\(\.btn, \.answer, \.navbtn, summary\) \{ min-height: 44px; \}/);
  assert.match(css,/padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom\)\)/);
});

test('wide league and playoff content scrolls inside the page instead of overflowing it',()=>{
  assert.match(css,/#leagueBox \.tablewrap/);
  assert.match(css,/width: max-content; min-width: 100%/);
  assert.match(css,/\.ps-funnel \{[\s\S]*overflow-x: auto/);
  assert.match(css,/\.ps-table \{ min-width: 600px; \}/);
  assert.match(css,/-webkit-overflow-scrolling: touch/);
});

test('commissioner and GameDay controls wrap on narrow phones',()=>{
  assert.match(css,/#commissionerBox \.row \{ flex-wrap: wrap; \}/);
  assert.match(css,/#commissionerDiagnostics \.diag-grid \{ grid-template-columns: 1fr !important; \}/);
  assert.match(css,/\.gd-toolbar, \.gd-actions \{ flex-wrap: wrap; \}/);
  assert.match(css,/\.gd-actions \{ width: 100%; margin-left: 0; \}/);
});

test('playoff confirmation matches the current seed bonuses',()=>{
  assert.ok(postseason.includes('10/8/7/5/4/3/2/0 starting bonuses'));
  assert.equal(postseason.includes('8/6/5/4/3/2/1/0 starting bonuses'),false);
});

test('secondary mobile navigation keeps the eight-page app reachable',()=>{
  assert.match(redesign,/more\.id = 'moreNav'/);
  assert.match(redesign,/panel\.id = 'secondaryNavigation'/);
  assert.match(redesign,/nav\.querySelectorAll\('\[data-page\]'\)/);
  assert.match(css,/\.nav-secondary-panel/);
  assert.match(css,/padding-bottom: max\(12px, env\(safe-area-inset-bottom\)\)/);
});

test('narrow-phone commissioner and Safari scrolling are hardened',()=>{
  assert.match(css,/#postLockPickOverride > \.grid \{ grid-template-columns: 1fr !important; \}/);
  assert.match(css,/@media \(max-width: 390px\)/);
  assert.match(redesign,/behavior: 'auto'/);
  assert.match(gameday,/behavior: 'auto'/);
});
