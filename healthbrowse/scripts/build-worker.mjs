import {readFile,readdir,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
const mimes={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',webmanifest:'application/manifest+json',png:'image/png'};
const assets={};
for(const entry of await readdir('dist',{withFileTypes:true})){
  const ext=entry.name.split('.').pop(),type=mimes[ext];
  if(entry.isFile()&&type){
    const file=await readFile('dist/'+entry.name);
    assets['/'+entry.name]={text:ext==='png'?file.toString('base64'):file.toString('utf8'),base64:ext==='png',type};
  }
}
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
const source="import {respond} from './worker/routes.mjs';\nconst assets="+JSON.stringify(assets)+";\nexport default {fetch(request,env){return respond(request,env,assets)}};";
await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'worker-entry.mjs'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',minify:true});
