// Source validation only. This does not open a browser or contact the live app.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=new URL('../',import.meta.url),html=await fs.readFile(new URL('index.html',root),'utf8');
const modules=[...html.matchAll(/<script src="([^"?]+)(?:\?[^\"]*)?"><\/script>/g)].map(m=>m[1]);
assert.equal(new Set(modules).size,modules.length,'Duplicate extension scripts would wrap every action twice');
for(const file of modules)new vm.Script(await fs.readFile(new URL(file,root),'utf8'),{filename:file});
for(const [i,m] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries())new vm.Script(m[1],{filename:'inline-'+i});
for(const m of html.matchAll(/<link[^>]*href="([^"?]+)(?:\?[^\"]*)?"/g))await fs.access(new URL(m[1],root));
const staticMarkup=html.replace(/<script>[\s\S]*?<\/script>/g,''),ids=[...staticMarkup.matchAll(/\bid="([^\"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate static page IDs');
for(const id of ['playoffs','playoffBox','playoffSync','playoffsNav','seasoncalendar','seasonCalendarBox'])assert.ok(ids.includes(id));
const build=JSON.parse(await fs.readFile(new URL('app-version.json',root),'utf8')).version;
assert.ok((await fs.readFile(new URL('app_update.js',root),'utf8')).includes("const BUILD_VERSION = '"+build+"'"));

// These existing push workflows must neither downgrade the build nor duplicate modules.
const installers=['patch_weekly_standings.py','patch_potential_unicorn.py','patch_admin_reliability.py','patch_path_to_win.py','patch_archived_week_editor.py','patch_finish_week_controls.py','patch_copy_standings.py','patch_quality_fixes.py'];
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pickem-release-'));
const targets=['index.html','app_update.js','app-version.json','notifications.js'];
try{
  for(const file of [...targets,...installers])await fs.copyFile(new URL(file,root),path.join(temp,file));
  for(const file of installers)execFileSync('python',[file],{cwd:temp,stdio:'pipe'});
  for(const file of targets)assert.equal(await fs.readFile(path.join(temp,file),'utf8'),await fs.readFile(new URL(file,root),'utf8'),file+' changed after running existing installers');
}finally{await fs.rm(temp,{recursive:true,force:true});}
console.log(modules.length+' scripts parse; page IDs, assets, versions, and installer idempotence checked.');
