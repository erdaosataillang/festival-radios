import {readFile,rm,mkdir,cp,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'public');
const apps=JSON.parse(await readFile(join(root,'apps.json'),'utf8'));
const seen=new Set();
for(const app of apps){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.id)||seen.has(app.id))throw new Error('Invalid or duplicate app id');
  seen.add(app.id);
  if((await lstat(join(root,app.id))).isSymbolicLink())throw new Error('App directories cannot be symlinks');
  await readFile(join(root,app.id,'index.html'));
}
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const name of ['index.html','apps.json','CNAME','assets'])await cp(join(root,name),join(output,name),{recursive:true});
for(const app of apps)await cp(join(root,app.id),join(output,app.id),{recursive:true});
await writeFile(join(output,'.nojekyll'),'');
console.log(`Prepared ${apps.length} apps: ${apps.map(app=>'/'+app.id+'/').join(', ')}`);
