const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../seasonal_themes_model.js');

test('holidays start and end at Eastern midnight, including the year rollover', () => {
  for (const [time, expected] of [
    ['2026-11-19T04:59:59.999Z', null],
    ['2026-11-19T05:00:00Z', 'thanksgiving'],
    ['2026-11-27T04:59:59.999Z', 'thanksgiving'],
    ['2026-11-27T05:00:00Z', null],
    ['2026-12-01T04:59:59.999Z', null],
    ['2026-12-01T05:00:00Z', 'christmas'],
    ['2026-12-26T04:59:59.999Z', 'christmas'],
    ['2026-12-26T05:00:00Z', null],
    ['2026-12-31T04:59:59.999Z', null],
    ['2026-12-31T05:00:00Z', 'newyear'],
    ['2027-01-02T04:59:59.999Z', 'newyear'],
    ['2027-01-02T05:00:00Z', null],
    ['2027-12-01T05:00:00Z', null]
  ]) assert.equal(model.at(Date.parse(time))?.id || null, expected, time);
  assert.equal(model.at(NaN), null);
});

test('next boundary supports idle-tab switching without a new deployment', () => {
  assert.equal(model.nextBoundary(Date.parse('2026-11-30T23:59:59-05:00')), Date.parse('2026-12-01T00:00:00-05:00'));
  assert.equal(model.nextBoundary(Date.parse('2026-12-01T00:00:00-05:00')), Date.parse('2026-12-26T00:00:00-05:00'));
  assert.equal(model.nextBoundary(Date.parse('2027-01-02T00:00:00-05:00')), null);
});

test('open page changes banners once, then restores normal colors and removes decorations', () => {
  let now = Date.parse('2026-11-26T23:59:59-05:00');
  let color = '#10151e';
  let nodes = [];
  const location = { search: '', pathname: '/pickem-site/', hash: '#standings' };
  const classes = new Set(), listeners = {}, timers = new Map();
  let sequence = 0;
  const host = { prepend(node) { nodes.push(node); } };
  const document = {
    documentElement: { classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } } },
    querySelector: () => ({ getAttribute: () => color, setAttribute: (_, value) => { color = value; } }),
    querySelectorAll: () => [...nodes],
    getElementById: () => host,
    createElement: () => ({ children: [], append(...children) { this.children.push(...children); }, setAttribute() {}, remove() { nodes = nodes.filter(node => node !== this); } }),
    readyState: 'loading',
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  vm.runInNewContext(fs.readFileSync('seasonal_themes.js', 'utf8'), {
    document, window: { location, SeasonalThemesModel: model, addEventListener(name, fn) { listeners[name] = fn; } },
    Date: { now: () => now }, URLSearchParams,
    setTimeout(fn, delay) { timers.set(++sequence, { fn, delay }); return sequence; },
    clearTimeout(id) { timers.delete(id); }
  });
  assert.deepEqual([...classes], ['thanksgiving']);
  assert.equal(nodes.length, 0, 'palette applies in head before the DOM exists');
  listeners.DOMContentLoaded();
  assert.equal(nodes.length, 2);
  assert.match(nodes[0].innerHTML, /Thanksgiving Week/);
  assert.equal([...timers.values()][0].delay, 1000);
  now += 1000;
  [...timers.values()][0].fn();
  assert.equal(nodes.length, 0);
  assert.equal(color, '#10151e');
  for (const [time, expected, heading, themeColor] of [
    ['2026-12-01T00:00:00-05:00', 'christmas', 'Christmas at Pick’em', '#101b17'],
    ['2026-12-26T00:00:00-05:00', null, null, '#10151e'],
    ['2026-12-31T00:00:00-05:00', 'newyear', 'Happy New Year', '#0b1321'],
    ['2027-01-02T00:00:00-05:00', null, null, '#10151e']
  ]) {
    now = Date.parse(time);
    listeners.pageshow();
    listeners.visibilitychange();
    assert.deepEqual([...classes], expected ? [expected] : []);
    assert.equal(nodes.length, expected ? 2 : 0, 'one banner each for app and login');
    if (heading) assert.ok(nodes[0].innerHTML.includes(heading));
    assert.equal(color, themeColor);
    assert.equal(timers.size, 1, 'resume does not accumulate timers');
  }
  location.search = '?themePreview=christmas&view=league';
  listeners.popstate();
  assert.deepEqual([...classes], ['christmas'], 'preview can show Christmas outside its dates');
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].children[0].children[1].href, '/pickem-site/?view=league#standings', 'exit removes only the preview parameter');
  location.search = '?themePreview=unknown';
  listeners.popstate();
  assert.equal(nodes.length, 0, 'unknown preview names are ignored');
  now = Date.parse('2026-12-10T12:00:00-05:00');
  location.search = '?themePreview=christmas';
  listeners.popstate();
  assert.equal(nodes[0].children.length, 1);
  location.search = '';
  listeners.popstate();
  assert.deepEqual([...classes], ['christmas']);
  assert.equal(nodes[0].children.length, 0, 'exit hides preview controls even during the same scheduled holiday');
});
