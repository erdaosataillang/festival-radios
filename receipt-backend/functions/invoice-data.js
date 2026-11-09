const math=require('./invoice-math');
function fail(status,message){throw Object.assign(new Error(message),{status});}
function text(value,max,required=false){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(400,'請求書の入力内容を確認してください。');return value.trim();}
function date(value,required=true){if(!value&&!required)return '';const v=text(value,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail(400,'日付を確認してください。');return v;}
function bank(value){if(!value||typeof value!=='object')fail(400,'振込先を登録してください。');const data={name:text(value.name??'',80),branch:text(value.branch??'',80),type:text(value.type??'普通',10),number:text(value.number??'',8),holder:text(value.holder??'',80)};if(!['普通','当座','貯蓄'].includes(data.type))fail(400,'口座種別を確認してください。');if(data.name||data.branch||data.number||data.holder){if(!data.name||!/^\d{1,8}$/.test(data.number)||!data.holder)fail(400,'銀行名・口座番号・口座名義を入力してください。');}return data;}
function invoice(value,registered,version,{draft=false}={}){
 if(!registered)fail(409,'先に発行者情報を登録してください。');if(version!==registered.version)fail(409,'発行者情報が更新されています。画面を再読み込みしてください。');
 if(!registered.bank?.name||!registered.bank?.number||!registered.bank?.holder)fail(409,'先に振込先を登録してください。');
 if(!value||!Array.isArray(value.items)||value.items.some(x=>!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>80))fail(400,'明細の項目名を入力してください。');
 let totals;try{totals=math.calculate(value.items,value.taxRate)}catch(error){fail(400,error.message)}
 if(totals.total<1)fail(400,'請求金額を入力してください。');
 if(!['御中','様'].includes(value.honorific)||!['hide','generated'].includes(value.seal)||!['round','square'].includes(value.sealShape)||!['mincho','gothic'].includes(value.sealFont)||!['unsigned','signed'].includes(value.signatureMode))fail(400,'設定を確認してください。');
 const sealName=text(value.sealName??'',8);if(value.seal==='generated'&&!sealName)fail(400,'印鑑の文字を入力してください。');
 const documentVariant=value.documentVariant??'invoice';
 if(!['invoice','invoiceEstimate','estimate'].includes(documentVariant))fail(400,'帳票の種類を確認してください。');
 return {documentType:'invoice',documentVariant,recipient:text(value.recipient,100,true),honorific:value.honorific,number:draft?'':text(value.number,40,true),permanent:'',date:date(value.date),deliveryDate:date(value.deliveryDate,false),dueDate:date(value.dueDate),subject:text(value.subject,150,true),note:text(value.note??'',400),...totals,issuer:registered.name,address:registered.address,phone:registered.phone,bank:registered.bank,issuerVersion:registered.version,seal:value.seal,sealName,sealShape:value.sealShape,sealFont:value.sealFont,signatureMode:value.signatureMode};
}
module.exports={bank,invoice};
