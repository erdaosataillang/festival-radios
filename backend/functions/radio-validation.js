'use strict';
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
function text(v,max,required=true){if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))fail(400,'入力内容を確認してください。');return v.trim();}
function validId(id){return typeof id==='string'&&/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(id);}
function profile(uid,data){if(data.disabled===true||data.active===false||data.radioAccess===false||typeof data.name!=='string'||!data.name.trim())return null;return {id:uid,name:data.name.trim().slice(0,80)};}
function validate(body){if(!['保管中','貸出中','点検中'].includes(body.status))fail(400,'状態を選択してください。');return {department:text(body.department,80),channel:text(body.channel,20),assignee:text(body.assignee,80,false),status:body.status,note:text(body.note,1000,false)};}
function publicRadio(snap){const d=snap.data();return {id:snap.id,department:d.department,channel:d.channel,assignee:d.assignee,status:d.status,note:d.note,version:d.version,updatedAt:d.updatedAt?.toDate().toISOString()||null};}
module.exports={fail,validId,profile,validate,publicRadio};
