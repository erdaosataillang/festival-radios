// RFC 4180: quoted commas, escaped quotes, CRLF and multiline fields.
export function parseCSV(source){
 const rows=[];let row=[],cell='',quoted=false,closed=false;source=source.replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){const c=source[i];
  if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw Error('CSVの引用符が正しくありません。');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){rows.push(row);row=[];if(c==='\r'&&source[i+1]==='\n')i++;}continue;}
  if(closed){if(c===' '||c==='\t')continue;throw Error('CSVの引用符の後に不正な文字があります。');}cell+=c;
 }
 if(quoted)throw Error('CSVの引用符が閉じていません。');if(cell||row.length||closed){row.push(cell);rows.push(row);}return rows;
}
const normalize=v=>String(v??'').normalize('NFKC').trim();
const header=v=>normalize(v).replace(/[\s.．]/g,'').toLowerCase();
const aliases={id:['管理番号'],number:['no','番号'],department:['セクション','担当部署'],affiliation:['所属'],assignee:['名前','担当者','担当者名'],channel:['ch','チャンネル'],note:['備考']};
export function importCSV(source){
 const rows=parseCSV(source),hi=rows.findIndex(r=>r.some(v=>header(v)==='管理番号'));
 if(hi<0)throw Error('「管理番号」を含む見出し行が見つかりません。');
 const headings=rows[hi].map(header),columns={};
 for(const [key,labels] of Object.entries(aliases)){const indices=headings.flatMap((v,i)=>labels.includes(v)?[i]:[]);if(indices.length>1)throw Error(`「${labels[0]}」列が重複しています。`);columns[key]=indices[0]??-1;if(columns[key]<0&&key!=='number')throw Error(`「${labels[0]}」列が見つかりません。`);}
 const records=[],errors=[],seen=new Set();
 rows.slice(hi+1).forEach((r,i)=>{if(r.every(v=>!normalize(v)))return;const value=key=>columns[key]<0?'':String(r[columns[key]]??'').trim();const record=Object.fromEntries(Object.keys(aliases).map(k=>[k,value(k)]));record.id=normalize(record.id).toUpperCase();record.number=normalize(record.number);record.channel=normalize(record.channel);const rowNumber=hi+i+2;
  const messages=[];if(!/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(record.id))messages.push('管理番号は半角英数字・ハイフン・アンダースコアで30文字以内にしてください');if(seen.has(record.id))messages.push('CSV内で管理番号が重複しています');seen.add(record.id);
  if(record.number&&!/^[1-9]\d{0,5}$/.test(record.number))messages.push('No.は1〜999999にしてください');for(const key of ['department','affiliation','assignee'])if(record[key].length>80)messages.push(`${aliases[key][0]}は80文字以内にしてください`);if(record.channel.length>20)messages.push('Ch.は20文字以内にしてください');if(record.note.length>1000)messages.push('備考は1000文字以内にしてください');
  if(messages.length)errors.push({row:rowNumber,id:record.id,message:messages.join('／')});records.push({...record,row:rowNumber});
 });
 if(!records.length)throw Error('取り込む機器がありません。');if(records.length>200)throw Error('一度に取り込める機器は200台までです。CSVを分けてください。');return {records,errors,headerRow:hi+1};
}
export async function readCSVFile(file){if(file.size>2*1024*1024)throw Error('CSVは2MB以下にしてください。');const bytes=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('shift_jis',{fatal:true}).decode(bytes);}}
