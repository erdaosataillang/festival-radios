'use strict';
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
function text(v,max,required=true){if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))fail(400,'入力内容を確認してください。');return v.trim();}
function validId(id){return typeof id==='string'&&/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(id);}
function profile(uid,data){if(data.disabled===true||data.active===false||data.radioAccess===false||typeof data.name!=='string'||!data.name.trim())return null;return {id:uid,name:data.name.trim().slice(0,80)};}
function validate(body){if(!['未確認','保管中','貸出中','点検中'].includes(body.status))fail(400,'状態を選択してください。');const number=text(body.number??'',6,false);if(number&&!/^[1-9]\d{0,5}$/.test(number))fail(400,'No.は1〜999999で入力してください。');const equipmentType=body.equipmentType??(String(body.note||'').includes('IP無線')?'ip':String(body.note||'').includes('インカム')?'intercom':'radio');if(!['radio','ip','intercom'].includes(equipmentType))fail(400,'機器種別を確認してください。');return {number,equipmentType,affiliation:text(body.affiliation??'',80,false),department:text(body.department,80,false),channel:text(body.channel,20,false),assignee:text(body.assignee,80,false),status:body.status,note:text(body.note,1000,false)};}
function publicRadio(snap){const d=snap.data();return {id:snap.id,number:d.number||'',equipmentType:d.equipmentType||'radio',affiliation:d.affiliation||'',department:d.department,channel:d.channel,assignee:d.assignee,status:d.status,note:d.note,version:d.version,updatedAt:d.updatedAt?.toDate().toISOString()||null};}
module.exports={fail,validId,profile,validate,publicRadio};

function validateImport(body){
 if(!['create','upsert'].includes(body.mode)||!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>200)fail(400,'取り込みは1〜200台で指定してください。');
 const seen=new Set();return body.rows.map(row=>{if(!row||!validId(row.id)||seen.has(row.id))fail(400,'管理番号が不正、または重複しています。');seen.add(row.id);if(row.version!==null&&(!Number.isInteger(row.version)||row.version<1))fail(400,'更新情報が正しくありません。');return {id:row.id,version:row.version,data:validate(row)};});
}
module.exports.validateImport=validateImport;
