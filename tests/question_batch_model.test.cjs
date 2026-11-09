const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','question_batch_model.js'),'utf8');
const context={window:{}};
vm.createContext(context);
new vm.Script(source).runInContext(context);
const parse=context.window.QuestionBatchModel.parse;

test('pipe-separated questions import together, with multiple choices',()=>{
  const data=parse('NFL | Who wins? | Home | Away\nCFB | Total? | Under | Exactly | Over');
  assert.deepEqual(Array.from(data.errors),[]);
  assert.equal(data.questions.length,2);
  assert.equal(data.questions[0].sport,'NFL');
  assert.equal(data.questions[0].prompt,'Who wins?');
  assert.deepEqual(Array.from(data.questions[1].answer_options),['Under','Exactly','Over']);
});

test('standard quoted CSV handles commas in prompts and choices',()=>{
  const data=parse('sport,question,choice1,choice2\nNFL,"Who wins, on Sunday?","Home, Team",Away');
  assert.equal(data.errors.length,0);
  assert.equal(data.questions.length,1);
  assert.equal(data.questions[0].prompt,'Who wins, on Sunday?');
  assert.equal(data.questions[0].answer_options[0],'Home, Team');
});

test('TSV import supports many rows',()=>{
  const data=parse('NFL\tWinner?\tHome\tAway\nCBB\tOvertime?\tYes\tNo');
  assert.equal(data.errors.length,0);
  assert.equal(data.questions.length,2);
});

test('invalid rows prevent a partial batch import',()=>{
  const data=parse('NFL | Winner? | A | B\nCFB | Missing choice | Only one');
  assert.equal(data.questions.length,1);
  assert.equal(data.errors.length,1);
});

test('duplicate choices, unknown sport and empty content are rejected',()=>{
  assert.equal(parse('NFL | Winner? | A | a').errors.length,1);
  assert.equal(parse('XYZ | Winner? | A | B').errors.length,1);
  assert.ok(parse('').errors.length>0);
});

test('release script is loaded after its model and all commissioner features',()=>{
  const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const model=index.indexOf('question_batch_model.js');
  const release=index.indexOf('question_batch_release.js');
  const commissioner=index.indexOf('commissioner_diagnostics.js');
  assert.ok(model>commissioner,'Batch parser should load after commissioner modules');
  assert.ok(release>model,'Release UI should load after its parser');
  const ui=fs.readFileSync(path.join(__dirname,'..','question_batch_release.js'),'utf8');
  assert.match(ui,/commissioner_release_week_questions/);
  assert.match(ui,/Release all/);
  assert.match(ui,/questions_released_at/);
});
