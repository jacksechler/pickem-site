const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('championship model loads before both page integrations',()=>{
  const html=read('index.html');
  const model=html.indexOf('src="championship_odds_model.js?v=1"');
  const playoff=html.indexOf('src="playoff_advancement.js?v=3"');
  const homepage=html.indexOf('src="league_central.js?v=3"');
  assert.ok(model>0&&playoff>model&&homepage>model);
});
test('Playoff Central presents advancement and championship chances together',()=>{
  const ui=read('playoff_advancement.js');
  assert.match(ui,/Advance &amp; Win It All/);
  assert.match(ui,/Chance to advance/);
  assert.match(ui,/Win it all/);
  assert.match(ui,/title\.titleOdds/);
  assert.match(ui,/getChampionship/);
});
test('Playoff forecast only fetches picks after locking and revalidates lock',()=>{
  const ui=read('playoff_advancement.js');
  assert.match(ui,/if\(!c\?\.locked\|\|c\?\.round\?\.status==='finalized'\)/);
  assert.match(ui,/if\(c\?\.locked&&c\.round\?\.status!=='finalized'\)/);
  assert.match(ui,/fresh\.current\.revision!==c\.revision/);
});
test('regular-season homepage includes championship forecast from first week',()=>{
  const page=read('league_central.js');
  assert.match(page,/ChampionshipOddsModel\?\.estimateRegular/);
  assert.match(page,/Chance to Win It All/);
  assert.match(page,/regularWeekCount=20/);
  assert.match(page,/if\(!d\.scores\.length\)/);
});
test('homepage switches to playoff odds after postseason begins',()=>{
  const page=read('league_central.js');
  assert.match(page,/\['live','complete'\]\.includes/);
  assert.match(page,/PlayoffAdvancement\.getChampionship/);
  assert.match(page,/const f=d\.playoffForecast\|\|d\.forecast/);
});
test('playoff opening status reveals both probabilities',()=>{
  const pop=read('opening_reveals.js');
  assert.match(pop,/championship,'Win it all'/);
  assert.match(pop,/advance,'Chance to advance'/);
});
