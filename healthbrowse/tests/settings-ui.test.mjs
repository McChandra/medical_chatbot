import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsSection,settingsSections,passwordCriteria} from '../dist/settings-ui.js';
import {readFileSync} from 'node:fs';
test('old account links and mobile navigation resolve to the correct settings section',()=>{
 for(const name of settingsSections)assert.equal(settingsSection('#'+name),name);
 for(const [old,next] of [['workspace','profile'],['history','chats'],['contact','help'],['feedback','help'],['deleteHistory','privacy'],['unknown','profile']])assert.equal(settingsSection('#'+old),next);
});
test('inline password criteria account for unicode byte limits and confirmation',()=>{
 assert.deepEqual(passwordCriteria('',''),{length:false,bytes:false,match:false});
 assert.deepEqual(passwordCriteria('a long unique passphrase','a long unique passphrase'),{length:true,bytes:true,match:true});
 assert.equal(passwordCriteria('😀'.repeat(20),'😀'.repeat(20)).bytes,false);
 assert.equal(passwordCriteria('a long unique passphrase','different').match,false);
});
test('settings markup keeps one ID per control and preserves every referenced account control',()=>{
 const html=readFileSync('dist/account.html','utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const file of ['dist/account.js','dist/settings-ui.js'])for(const [,id] of readFileSync(file,'utf8').matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),file+' references '+id);
 for(const section of settingsSections)assert.ok(html.includes('data-settings-panel="'+section+'"'));
 assert.match(html,/id="profileEmail"[^>]*disabled/);assert.match(html,/id="confirmDeleteChats"[^>]*disabled/);
});
