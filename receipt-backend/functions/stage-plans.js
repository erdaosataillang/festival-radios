'use strict';
const stageTypes=new Set(['hall','multipurpose','temporary']);
const kinds=new Set(require('./stage-catalog.json').map(tool=>tool.id));
function validatePlan(value,fail){
 const title=typeof value?.title==='string'?value.title.trim():'';
 if(!title||title.length>100||!Array.isArray(value.items)||value.items.length>200)
  fail(400,'図面名と機材数を確認してください。');
 const assets=value.assets??[];
 if(!Array.isArray(assets)||assets.length>60)fail(400,'SVGの点数を確認してください。');
 const assetIds=new Set();let assetSize=0;
 for(const asset of assets){
  if(!asset||typeof asset.id!=='string'||!/^[a-f0-9-]{36}$/.test(asset.id)||assetIds.has(asset.id)||
     typeof asset.name!=='string'||asset.name.length>80||
     typeof asset.data!=='string'||!/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.data)||
     !Number.isFinite(asset.ratio)||asset.ratio<0.02||asset.ratio>50)fail(400,'SVGの情報を確認してください。');
  assetIds.add(asset.id);assetSize+=asset.data.length;
 }
 if(assetSize>650000)fail(400,'図面に保存するSVGの合計容量を超えました。');
 const background=value.background;
 if(background!=null&&!assetIds.has(background))fail(400,'下絵のSVGを確認してください。');
 const seen=new Set();
 const items=value.items.map(item=>{
  if(!item||!(kinds.has(item.kind)||(item.kind==='imported-svg'&&assetIds.has(item.assetId)))||typeof item.id!=='string'||!/^[a-f0-9-]{36}$/.test(item.id)||seen.has(item.id)||
     typeof item.name!=='string'||item.name.length>80||!Number.isFinite(item.x)||item.x<0||item.x>1000||
     !Number.isFinite(item.y)||item.y<0||item.y>650||!Number.isInteger(item.angle)||item.angle<0||item.angle>=360||
     !Number.isFinite(item.height)||item.height<0||item.height>30)fail(400,'機材の設定を確認してください。');
  if(item.source!==undefined&&!['venue','bring'].includes(item.source))fail(400,'機材の区分を確認してください。');
  if(item.quantity!==undefined&&(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>999))fail(400,'機材表の数量を確認してください。');
  if(item.size!==undefined&&(!Number.isInteger(item.size)||item.size<1||item.size>20000))fail(400,'記号の幅を確認してください。');
  seen.add(item.id);
  return {id:item.id,kind:item.kind,name:item.name.trim(),x:item.x,y:item.y,angle:item.angle,height:item.height,...(item.source?{source:item.source}:{}),...(item.size?{size:item.size}:{}),...(item.quantity?{quantity:item.quantity}:{}),...(item.kind==='imported-svg'?{assetId:item.assetId}:{})};
 });
 if(value.stageType!==undefined&&!stageTypes.has(value.stageType))fail(400,'ステージタイプを確認してください。');
 const dimensions=value.dimensions;
 if(dimensions!==undefined&&(!dimensions||![dimensions.width,dimensions.depth].every(n=>Number.isInteger(n)&&n>=100&&n<=20000)))fail(400,'ステージ寸法は100〜20000 cmで入力してください。');
 const venue=value.venue;
 if(venue!==undefined){
  const validPoint=(point,minX,maxX,minY,maxY)=>Array.isArray(point)&&point.length===2&&
   Number.isInteger(point[0])&&Number.isInteger(point[1])&&point[0]>=minX&&point[0]<=maxX&&point[1]>=minY&&point[1]<=maxY;
  if(!dimensions||!venue||!Array.isArray(venue.outline)||venue.outline.length<3||venue.outline.length>32||
     !venue.outline.every(p=>validPoint(p,0,dimensions.width,0,dimensions.depth))||
     !Array.isArray(venue.curtains)||venue.curtains.length>32||venue.curtains.some(c=>!c||typeof c.name!=='string'||!c.name.trim()||c.name.length>40||
      !validPoint(c.start,-20000,20000,-20000,20000)||!validPoint(c.end,-20000,20000,-20000,20000)||
      (c.start[0]===c.end[0]&&c.start[1]===c.end[1])))fail(400,'舞台外周と幕の座標を確認してください。');
 }
 return {title,items,...(value.assets!==undefined?{assets:assets.map(({id,name,data,ratio})=>({id,name,data,ratio})),background:background??null}:{}),...(venue?{venue:{outline:venue.outline.map(([x,y])=>({x,y})),curtains:venue.curtains.map(({name,start,end})=>({name:name.trim(),start,end}))}}:{}),...(dimensions?{dimensions:{width:dimensions.width,depth:dimensions.depth}}:{}),...(value.stageType?{stageType:value.stageType}:{})};
}
async function handleStagePlans({req,res,body,db,user,Timestamp,now,fail}){
 const plans=db.collection('stagePlanUsers').doc(user.uid).collection('plans');
 if(req.method==='GET'&&req.path==='/stage/plans'){
  const list=await plans.orderBy('updatedAt','desc').limit(100).get();
  res.json({plans:list.docs.map(doc=>({id:doc.id,title:doc.get('title'),stageType:doc.get('stageType')??null,updatedAt:doc.get('updatedAt').toMillis()}))});
  return true;
 }
 const match=req.path.match(/^\/stage\/plans\/([A-Za-z0-9]{20})$/);
 if(req.method==='GET'&&match){
  const doc=await plans.doc(match[1]).get();
  if(!doc.exists)fail(404,'図面が見つかりません。');
  const {title,items,version,stageType,dimensions,venue,assets,background}=doc.data();
  res.json({id:doc.id,title,items,version,...(assets?.length?{assets}:{}),...(background?{background}:{}),...(venue?{venue:{...venue,outline:venue.outline.map(({x,y})=>[x,y])}}:{}),...(dimensions?{dimensions}:{}),...(stageType?{stageType}:{})});
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
