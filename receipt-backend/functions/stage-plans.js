'use strict';
const kinds=new Set(['speaker','monitor','sub','light','truss']);
function validatePlan(value,fail){
 const title=typeof value?.title==='string'?value.title.trim():'';
 if(!title||title.length>100||!Array.isArray(value.items)||value.items.length>200)
  fail(400,'図面名と機材数を確認してください。');
 const seen=new Set();
 const items=value.items.map(item=>{
  if(!item||!kinds.has(item.kind)||typeof item.id!=='string'||!/^[a-f0-9-]{36}$/.test(item.id)||seen.has(item.id)||
     typeof item.name!=='string'||item.name.length>80||!Number.isFinite(item.x)||item.x<0||item.x>1000||
     !Number.isFinite(item.y)||item.y<0||item.y>650||!Number.isInteger(item.angle)||item.angle<0||item.angle>=360||
     !Number.isFinite(item.height)||item.height<0||item.height>30)fail(400,'機材の設定を確認してください。');
  seen.add(item.id);
  return {id:item.id,kind:item.kind,name:item.name.trim(),x:item.x,y:item.y,angle:item.angle,height:item.height};
 });
 return {title,items};
}
async function handleStagePlans({req,res,body,db,user,Timestamp,now,fail}){
 const plans=db.collection('stagePlanUsers').doc(user.uid).collection('plans');
 if(req.method==='GET'&&req.path==='/stage/plans'){
  const list=await plans.orderBy('updatedAt','desc').limit(100).get();
  res.json({plans:list.docs.map(doc=>({id:doc.id,title:doc.get('title'),updatedAt:doc.get('updatedAt').toMillis()}))});
  return true;
 }
 const match=req.path.match(/^\/stage\/plans\/([A-Za-z0-9]{20})$/);
 if(req.method==='GET'&&match){
  const doc=await plans.doc(match[1]).get();
  if(!doc.exists)fail(404,'図面が見つかりません。');
  const {title,items,version}=doc.data();
  res.json({id:doc.id,title,items,version});
  return true;
 }
 if(req.method==='POST'&&(req.path==='/stage/plans'||match)){
  const plan=validatePlan(body.plan,fail);
  const ref=match?plans.doc(match[1]):plans.doc();
  const version=await db.runTransaction(async transaction=>{
   const doc=await transaction.get(ref);
   if(match&&!doc.exists)fail(404,'図面が見つかりません。');
   if(match&&doc.get('version')!==body.version)fail(409,'別の画面で図面が更新されています。開き直してください。');
   const version=match?body.version+1:1;
   const record={...plan,version,updatedAt:Timestamp.fromMillis(now())};
   if(match)transaction.update(ref,record);
   else transaction.create(ref,record);
   return version;
  });
  res.json({id:ref.id,version});
  return true;
 }
 return false;
}
module.exports={handleStagePlans,validatePlan};
