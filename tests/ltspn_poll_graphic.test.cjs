const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('a graphic expands to include every team tied at No. 25, with footer below the rows',async()=>{
  const text=[];
  const ctx={fillRect(){},fillText:(value,x,y)=>text.push({value,x,y}),measureText:v=>({width:v.length*8})};
  const canvas={getContext:()=>ctx,toBlob:fn=>fn({type:'image/png'})};
  class Image {set src(value){this.onerror();}}
  const window={};
  vm.runInNewContext(fs.readFileSync('ltspn_poll_graphic.js','utf8'),{window,document:{createElement:()=>canvas},Image,setTimeout,clearTimeout});
  const rows=Array.from({length:26},(_,i)=>({id:String(i),rank:Math.min(i+1,25),name:'Team '+i,points:26-i,first:0}));
  const blob=await window.LTSPNPollGraphic.render({rows,title:'LTSPN',subtitle:'Week 12',footer:'Poll footer'});
  assert.equal(blob.type,'image/png');assert.equal(canvas.height,1780);
  const last=text.find(r=>r.value==='Team 25');assert.ok(last,'26th team is not cut off');
  assert.ok(text.find(r=>r.value==='Poll footer').y>last.y+48);
});
