'use strict';
const {readFile}=require('node:fs/promises');
const {join}=require('node:path');
const sourceCatalog=require('./kiwi-catalog.json');
const sourceKinds=new Set(sourceCatalog.map(item=>item.id));
const WORLD_LIMIT=1000000;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const stageTypes=new Set(['hall','multipurpose','temporary']);
const kinds=new Set([...require('./stage-catalog.json').map(tool=>tool.id),...sourceKinds,'annotation-line','annotation-text']);
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
 const layers=value.layers??[{id:'base',name:'基本',visible:true}];
 if(!Array.isArray(layers)||!layers.length||layers.length>20)fail(400,'レイヤー数を確認してください。');
 const layerIds=new Set();
 for(const layer of layers){
  if(!layer||typeof layer.id!=='string'||(layer.id!=='base'&&!uuid.test(layer.id))||layerIds.has(layer.id)||
     typeof layer.name!=='string'||!layer.name.trim()||layer.name.length>40||typeof layer.visible!=='boolean')
   fail(400,'レイヤーの設定を確認してください。');
  layerIds.add(layer.id);
 }
 if(!layerIds.has('base')||!layers.some(layer=>layer.visible))fail(400,'レイヤーの表示設定を確認してください。');
 const seen=new Set();
 const items=value.items.map(item=>{
  if(!item||!(kinds.has(item.kind)||(item.kind==='imported-svg'&&assetIds.has(item.assetId)))||typeof item.id!=='string'||!/^[a-f0-9-]{36}$/.test(item.id)||seen.has(item.id)||
     typeof item.name!=='string'||item.name.length>80||!Number.isFinite(item.x)||Math.abs(item.x)>WORLD_LIMIT||
     !Number.isFinite(item.y)||Math.abs(item.y)>WORLD_LIMIT||!Number.isInteger(item.angle)||item.angle<0||item.angle>=360||
     !Number.isFinite(item.height)||item.height<0||item.height>30)fail(400,'機材の設定を確認してください。');
  if(item.source!==undefined&&!['venue','bring'].includes(item.source))fail(400,'機材の区分を確認してください。');
  if(item.quantity!==undefined&&(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>999))fail(400,'機材表の数量を確認してください。');
  if(item.size!==undefined&&(!Number.isInteger(item.size)||item.size<1||item.size>20000))fail(400,'記号の幅を確認してください。');
  if(item.layerId!==undefined&&!layerIds.has(item.layerId))fail(400,'配置先のレイヤーを確認してください。');
  if(item.groupId!==undefined&&(typeof item.groupId!=='string'||!uuid.test(item.groupId)))fail(400,'グループを確認してください。');
  if(item.color!==undefined&&(typeof item.color!=='string'||!/^#[0-9a-f]{6}$/i.test(item.color)))fail(400,'色を確認してください。');
  if(item.opacity!==undefined&&(!Number.isInteger(item.opacity)||item.opacity<10||item.opacity>100))fail(400,'透明度を確認してください。');
  if([item.flipX,item.locked].some(flag=>flag!==undefined&&typeof flag!=='boolean'))fail(400,'オブジェクトの設定を確認してください。');
  seen.add(item.id);
  return {id:item.id,kind:item.kind,name:item.name.trim(),x:item.x,y:item.y,angle:item.angle,height:item.height,...(item.color?{color:item.color}:{}),...(item.opacity!==undefined?{opacity:item.opacity}:{}),...(item.flipX?{flipX:true}:{}),...(item.locked?{locked:true}:{}),...(item.layerId?{layerId:item.layerId}:{}),...(item.groupId?{groupId:item.groupId}:{}),...(item.source?{source:item.source}:{}),...(item.size?{size:item.size}:{}),...(item.quantity?{quantity:item.quantity}:{}),...(item.kind==='imported-svg'?{assetId:item.assetId}:{})};
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
 return {title,items,layers:layers.map(({id,name,visible})=>({id,name:name.trim(),visible})),...(value.assets!==undefined?{assets:assets.map(({id,name,data,ratio})=>({id,name,data,ratio})),background:background??null}:{}),...(venue?{venue:{outline:venue.outline.map(([x,y])=>({x,y})),curtains:venue.curtains.map(({name,start,end})=>({name:name.trim(),start,end}))}}:{}),...(dimensions?{dimensions:{width:dimensions.width,depth:dimensions.depth}}:{}),...(value.stageType?{stageType:value.stageType}:{})};
}
async function handleStagePlans({req,res,body,db,user,Timestamp,now,fail}){
 if(req.method==='GET'&&req.path==='/stage/source-catalog'){
  res.json({symbols:sourceCatalog});return true;
 }
 const sourceMatch=req.path.match(/^\/stage\/source-svg\/(kiwi-[a-f0-9]{20})$/);
 if(req.method==='GET'&&sourceMatch){
  const id=sourceMatch[1];
  if(!sourceKinds.has(id))fail(404,'SVG記号が見つかりません。');
  const file=await readFile(join(__dirname,'kiwi-assets',id+'.svg'));
  res.json({data:'data:image/svg+xml;base64,'+file.toString('base64')});
  return true;
 }
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
  const {title,items,version,stageType,dimensions,venue,assets,background,layers}=doc.data();
  res.json({id:doc.id,title,items,version,...(layers?{layers}:{}),...(assets?.length?{assets}:{}),...(background?{background}:{}),...(venue?{venue:{...venue,outline:venue.outline.map(({x,y})=>[x,y])}}:{}),...(dimensions?{dimensions}:{}),...(stageType?{stageType}:{})});
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
