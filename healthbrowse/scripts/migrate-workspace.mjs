import {readFile} from 'node:fs/promises';
import {openWorkspace} from '../server/sqlite-workspace.mjs';
if(!process.env.WORKSPACE_DB_PATH)throw new Error('Set WORKSPACE_DB_PATH to a database on your persistent volume.');
const db=openWorkspace(process.env.WORKSPACE_DB_PATH);
try{
 db.exec('CREATE TABLE IF NOT EXISTS hb_migration_journal (tag TEXT PRIMARY KEY NOT NULL)');
 const journal=JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 for(const entry of journal.entries){
  if(await db.prepare('SELECT tag FROM hb_migration_journal WHERE tag=?').bind(entry.tag).first())continue;
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(await readFile(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));await db.prepare('INSERT INTO hb_migration_journal (tag) VALUES (?)').bind(entry.tag).run();db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
 }
 console.log('Workspace schema is current.');
}finally{db.close()}
