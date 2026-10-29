const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the league and history tables expose a dedicated, keyboard-accessible pick grid', () => {
  const history = read('history_profiles.js');
  assert.match(history, /card tablewrap pick-grid-tablewrap/);
  assert.match(history, /role="region"/);
  assert.match(history, /aria-label="Pick grid: scroll horizontally for players and vertically for all questions"/);
  assert.match(history, /style="min-width:1100px"/);
});

test('mobile CSS never blocks vertical scrolling in the full pick grid', () => {
  const css = read('mobile_ux.css');
  const block = css.match(/\.clean-ui #leagueBox \.tablewrap:not\(#weeklyStandingsV2\),[\s\S]*?touch-action: pan-x pan-y;/);
  assert.ok(block, 'expected mobile pick-grid CSS rule');
  assert.match(block[0], /overflow-x: auto !important;/);
  assert.match(block[0], /overflow-y: auto !important;/);
  assert.doesNotMatch(block[0], /overflow-y: hidden/);
});

test('the last-loaded scroll stylesheet supports both touch scroll directions', () => {
  const css = read('league_scroll_fixes.css');
  assert.match(css, /#leagueBox \.pick-grid-tablewrap,[\s\S]*?#historyBox \.pick-grid-tablewrap/);
  assert.match(css, /max-height: min\(68dvh, 720px\) !important/);
  assert.match(css, /overflow-x: auto !important/);
  assert.match(css, /overflow-y: auto !important/);
  assert.match(css, /touch-action: pan-x pan-y/);
  assert.match(css, /-webkit-overflow-scrolling: touch/);
  assert.match(css, /overscroll-behavior-y: auto/);
});

test('weekly standings remain a normal page section, not a nested scroll panel', () => {
  const css = read('league_scroll_fixes.css');
  assert.match(css, /#weeklyStandingsV2[\s\S]*?max-height: none !important/);
  assert.match(css, /#weeklyStandingsV2[\s\S]*?overflow: visible !important/);
});

test('updated grid scripts and both scroll stylesheets load on the actual page', () => {
  const html = read('index.html');
  assert.match(html, /mobile_ux\.css\?v=4/);
  assert.match(html, /league_scroll_fixes\.css\?v=2/);
  assert.match(html, /history_profiles\.js\?v=7/);
  assert.ok(html.indexOf('league_scroll_fixes.css?v=2') > html.indexOf('mobile_ux.css?v=4'));
});
