import './prepare-pages.mjs';
import {cp, mkdir, rm} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const output=new URL('stage-hosting/',root);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of ['stage-plan','assets'])
 await cp(new URL('public/'+name,root),new URL(name,output),{recursive:true});
