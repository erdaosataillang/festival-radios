'use strict';
function fail(status,message){throw Object.assign(new Error(message),{status});}
function text(value,max,required=false){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(400,'入力内容を確認してください。');return value.trim();}
function issuer(value){if(!value||typeof value!=='object')fail(400,'発行者を登録してください。');return {name:text(value.name,100,true),address:text(value.address??'',250),phone:text(value.phone??'',40)};}
function receipt(value,registered,version){
 if(!registered)fail(409,'先に発行者情報を登録してください。');
 if(version!==registered.version)fail(409,'発行者情報が更新されています。画面を再読み込みしてください。');
 if(!value||typeof value!=='object')fail(400,'領収書の内容を確認してください。');
 const amount=Number(value.amount);if(!Number.isSafeInteger(amount)||amount<1||amount>999999999999)fail(400,'金額を確認してください。');
 const date=text(value.date,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail(400,'発行日を確認してください。');
 if(!['御中','様'].includes(value.honorific)||!['hide','generated'].includes(value.seal)||!['round','square'].includes(value.sealShape)||!['mincho','gothic'].includes(value.sealFont)||!['unsigned','signed'].includes(value.signatureMode))fail(400,'領収書の設定を確認してください。');
 const sealName=text(value.sealName??'',8);if(value.seal==='generated'&&!sealName)fail(400,'印鑑の文字を入力してください。');
 // The issuer is always taken from the account's registered profile, never from client input.
 return {recipient:text(value.recipient,100,true),honorific:value.honorific,date,amount,purpose:text(value.purpose,250,true),detail:text(value.detail??'',150),number:text(value.number,40,true),permanent:text(value.permanent??'',40),note:text(value.note??'',400),issuer:registered.name,address:registered.address,phone:registered.phone,issuerVersion:registered.version,seal:value.seal,sealName,sealShape:value.sealShape,sealFont:value.sealFont,signatureMode:value.signatureMode};
}
function seal(value){
 if(!value||typeof value!=='object')fail(400,'印鑑の設定を確認してください。');
 const sealName=text(value.sealName,8,true);
 if(!['round','square'].includes(value.sealShape)||!['mincho','gothic'].includes(value.sealFont))fail(400,'印鑑の設定を確認してください。');
 return {sealName,sealShape:value.sealShape,sealFont:value.sealFont};
}
module.exports={issuer,receipt,seal};
