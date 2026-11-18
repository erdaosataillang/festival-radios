import {readFile,rm,mkdir,cp,writeFile,lstat,access,mkdtemp} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'public');
const runFile=promisify(execFile);

async function exists(path){try{await access(path);return true;}catch{return false;}}
async function locateLmcSource(){
  const configured=process.env.LMC_APP_SOURCE?resolve(process.env.LMC_APP_SOURCE):'';
  if(configured&&await exists(join(configured,'admin','index.html')))return configured;
  const sibling=resolve(root,'../lmc-app');
  if(await exists(join(sibling,'admin','index.html')))return sibling;
  const checkout=await mkdtemp(join(tmpdir(),'lmc-app-'));
  await runFile('git',['clone','--depth','1','https://github.com/erdaosataillang/lmc-app.git',checkout]);
  return checkout;
}

async function copyLmcAdmin(){
  const source=await locateLmcSource();
  await cp(join(source,'admin'),join(output,'lmc','app','admin'),{recursive:true});
  await cp(join(source,'css'),join(output,'css'),{recursive:true});
  await cp(join(source,'assets','lmc-wave-loader.svg'),join(output,'assets','lmc-wave-loader.svg'));
  await cp(join(source,'image-cache-sw.js'),join(output,'image-cache-sw.js'));
  await mkdir(join(output,'js'),{recursive:true});
  for(const file of ['admin-common.js','analytics.js','error-reporter.js','line-firebase-auth.js','lmc-loader-transition.js']){
    await cp(join(source,'js',file),join(output,'js',file));
  }
}
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
await cp(join(root,'receipt-backend/functions/stage-catalog.json'),join(output,'stage-plan/catalog.json'));
await copyLmcAdmin();
await writeFile(join(output,'.nojekyll'),'');
console.log(`Prepared ${apps.length} apps: ${apps.map(app=>'/'+app.id+'/').join(', ')}`);
