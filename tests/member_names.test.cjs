const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const Names=require('../member_names.js');

test('all eight original league usernames display as First Last',()=>{
  const cases={
    jacksechler:'Jack Sechler',
    cadechristy:'Cade Christy',
    brodyravenstahl:'Brody Ravenstahl',
    chasecarulli:'Chase Carulli',
    evanlewis:'Evan Lewis',
    jacksongraham:'Jackson Graham',
    klayfunovits:'Klay Funovits',
    lincolnconstant:'Lincoln Constant'
  };
  for(const [username,expected] of Object.entries(cases)){
    assert.equal(Names.full({username,display_name:username}),expected);
    assert.equal(Names.full({username,display_name:expected.split(' ')[0]}),expected);
    assert.equal(Names.full({username:username.toUpperCase()}),expected);
  }
});
test('existing complete display names remain authoritative over known usernames',()=>{
  assert.equal(Names.full({username:'jacksechler',display_name:'Jack S. Sechler'}),'Jack S. Sechler');
  assert.equal(Names.full({display_name:'Taylor Morgan'}),'Taylor Morgan');
});
test('unknown concatenated usernames are not split into guessed names',()=>{
  assert.equal(Names.full({username:'averyjordan',display_name:'averyjordan'}),'averyjordan');
  assert.equal(Names.full({display_name:'Alex'}),'Alex');
  assert.equal(Names.full({}),'Member');
});
test('member display formatting has no effects on the actual login identity',()=>{
  const person={id:'abc',username:'jacksongraham',display_name:'jacksongraham',role:'member'};
  const saved=JSON.stringify(person);
  assert.equal(Names.full(person),'Jackson Graham');
  assert.equal(JSON.stringify(person),saved);
});
test('member name formatter loads before other league rendering scripts',()=>{
  const page=read('index.html');
  const name=page.indexOf('member_names.js?v=1');
  const auth=page.indexOf('auth_session.js?v=1');
  const history=page.indexOf('history_profiles.js?v=7');
  assert.ok(name>0&&name<auth&&auth<history);
  assert.match(page,/MemberNames\?\.full\(profile\)/);
  assert.match(page,/data-page="news"/);
});
test('full names flow through standings, picks, shared grids, recaps and odds',()=>{
  const sources=[
    'history_profiles.js','weekly_standings_v2.js','screenshot_grid.js',
    'copy_standings.js','stats_v2.js','live_weekend.js',
    'features_v3.js','quality_fixes.js','path_to_win.js',
    'share_grid.js','league_central.js','weekly_win_odds.js',
    'opening_reveals.js','league_news_model.js','ltspn_editorial_model.js',
    'championship_history_model.js'
  ];
  for(const file of sources)
    assert.match(read(file),/MemberNames\?\.full/,file+' must format display names');
});
test('playoff RPC names are normalized for championship, survival and history',()=>{
  const source=read('postseason.js');
  assert.match(source,/function normalizeMemberNames\(value\)/);
  assert.match(source,/value\.entries/);
  assert.match(source,/value\.current\?\.rows/);
  assert.match(source,/value\.history/);
  assert.match(source,/const value=normalizeMemberNames\(await rpc\('postseason_state'/);
});
test('full two-part names wrap in mobile screenshot columns instead of clipping',()=>{
  assert.match(read('history_profiles.js'),/white-space:normal;overflow-wrap:anywhere/);
  assert.match(read('screenshot_grid.js'),/white-space:normal;overflow-wrap:anywhere/);
});
test('account credentials and player slot usernames are still unmodified',()=>{
  const home=read('index.html');
  assert.match(home,/function normalizeUsername\(v\)/);
  assert.match(home,/username\+'@pickem\.test'/);
  assert.match(home,/JSON\.stringify\(\{display_name:name,username\}\)/);
});
