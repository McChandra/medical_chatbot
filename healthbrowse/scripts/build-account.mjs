import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({
  stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:root,loader:'js'},
  absWorkingDir:root,outfile:'dist/supabase-client.js',platform:'browser',target:'es2022',
  format:'esm',bundle:true,minify:true,sourcemap:false,legalComments:'inline',
});
