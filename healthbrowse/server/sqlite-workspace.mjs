// D1-compatible adapter for single-instance deployments and real SQL tests.
// Use a persistent volume. Cloud Run replicas should use managed D1/another shared store.
import {DatabaseSync} from 'node:sqlite';
export function openWorkspace(path){
 const connection=new DatabaseSync(path);connection.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 const prepare=query=>({bind(...args){const statement=connection.prepare(query);return {
  async run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}},
  async first(){return statement.get(...args)||null},
  async all(){return {results:statement.all(...args)}}
 }}});
 return {prepare,async batch(statements){connection.exec('BEGIN IMMEDIATE');try{const rows=[];for(const s of statements)rows.push(await s.run());connection.exec('COMMIT');return rows}catch(error){connection.exec('ROLLBACK');throw error}},exec:sql=>connection.exec(sql),close:()=>connection.close()};
}
