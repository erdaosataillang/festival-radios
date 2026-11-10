import {api,setupSession} from './session.js?v=rulers-drop-resume-1';
import {equipmentShape} from './equipment-symbols.js?v=4';

const stageTypes={
 hall:{label:'ホール',description:'舞台と客席の区画が分かれた会場',bounds:[155,82,690,335]},
 multipurpose:{label:'多目的ホール',description:'室内にステージと客席を配置する会場',bounds:[205,95,590,245]},
 temporary:{label:'仮設ステージ',description:'屋外やイベント会場に設置するステージ',bounds:[275,130,450,210]},
};
let stageType=null,dimensions=null,venue=null,assets=[],background=null,planEpoch=0;
const defaultDimensions={hall:[1400,700],multipurpose:[1000,500],temporary:[800,400]};
function geometry(){
 const [x,y,w,h]=(stageTypes[stageType]||stageTypes.hall).bounds;
 if(!dimensions)return {x,y,w,h,scale:1};
 const scale=Math.min(690/dimensions.width,335/dimensions.depth);
 const width=dimensions.width*scale,height=dimensions.depth*scale;
 return {x:(1000-width)/2,y:82,w:width,h:height,scale};
}
function positionCm(item,frame=geometry()){
 return {x:Math.round((item.x-frame.x)/frame.scale),y:Math.round((item.y-frame.y)/frame.scale)};
}
function positionSvg(x,y,frame=geometry()){
 return {x:frame.x+x*frame.scale,y:frame.y+y*frame.scale};
}

const colors={speakers:'#255a88',instruments:'#326f64',audio:'#47456a',lighting:'#99610e',rigging:'#6b4384',stage:'#5b6472'};
const tools=Object.create(null);
const sourceImages=new Map();
const annotationTools={
 'annotation-line':{label:'線',color:'#192326'},
 'annotation-text':{label:'テキスト',color:'#192326'},
};
const isRigging=item=>tools[item?.kind]?.group==='rigging';
const isAnnotation=item=>Object.hasOwn(annotationTools,item.kind);
let lineDraft=null,lastObjectTap=null;
async function loadSourceImage(kind){
 if(sourceImages.has(kind))return sourceImages.get(kind);
 const loading=api('/stage/source-svg/'+kind).then(result=>result.data).catch(error=>{
  sourceImages.delete(kind);
  throw error;
 });
 sourceImages.set(kind,loading);
 return loading;
}
async function loadCatalog(){
 const response=await fetch(new URL('./catalog.json?v=3',import.meta.url));
 if(!response.ok)throw new Error('機材一覧を読み込めませんでした。');
 for(const {id,label,group,symbol,mark} of await response.json())
  tools[id]={label,group,color:colors[group],shape:equipmentShape(symbol,mark)};
 const {symbols}=await api('/stage/source-catalog');
 const categories=document.createElement('optgroup');categories.label='舞台仕込み図オープンテンプレート';
 for(const category of new Set(symbols.map(item=>item.category)))categories.append(new Option(category,'source:'+category));
 el('equipment-category').append(categories);
 for(const {id,label,category,ratio,size} of symbols)
  tools[id]={label,group:'source:'+category,source:{ratio,size},color:'#474747'};
 renderPalette();
}
const el=id=>document.getElementById(id);
const diagram=el('diagram');
const equipment=el('equipment');
const status=message=>{el('plan-status').textContent=message;};
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
let items=[],id=null,version=null,selectedId=null,placing=null,drag=null;
let dirty=false,saving=null,opening=false,saveTimer,lastPlanKey;
let recentObjects=[],recentObjectsKey=null;
const recentLimit=20;
function rememberPlan(){
 if(!lastPlanKey||!id)return;
 try{localStorage.setItem(lastPlanKey,id);}catch{}
}
let previous,undoStack=[],redoStack=[];
const baseLayer={id:'base',name:'基本',visible:true};
let layers=[baseLayer],activeLayer='base';
const marked=new Set();
const layerOf=item=>item.layerId??'base';
const visible=item=>layers.find(layer=>layer.id===layerOf(item))?.visible!==false;
const groupOf=item=>item?.groupId?items.filter(entry=>entry.groupId===item.groupId):item?[item]:[];
const locked=item=>groupOf(item).some(entry=>entry.locked);
let savedPlan=null;
const planPayload=()=>({title:el('plan-name').value.trim(),layers,
 ...(stageType?{stageType}:{}),...(dimensions?{dimensions}:{}),...(venue?{venue}:{}),assets,background,
 items:items.map(item=>({...item}))});
const hasUnsavedChanges=()=>JSON.stringify(planPayload())!==savedPlan;
const orderedItems=()=>layers.flatMap(layer=>items.filter(item=>layerOf(item)===layer.id));
const snapshot=()=>({layers,title:el('plan-name').value,items:items.map(item=>({...item})),selectedId,dimensions,venue,assets,background});
function scheduleSave(){
 clearTimeout(saveTimer);
 if(dirty&&!saving&&!opening&&!drag)saveTimer=setTimeout(()=>savePlan(),850);
}
const selected=()=>items.find(item=>item.id===selectedId);
function changed(){
 const next=snapshot();
 if(id&&previous&&JSON.stringify({...next,selectedId:null})===JSON.stringify({...previous,selectedId:null}))return;
 if(previous&&(!drag||!drag.undoRecorded)){
  undoStack.push(previous);
  if(undoStack.length>60)undoStack.shift();
  redoStack=[];
  if(drag)drag.undoRecorded=true;
 }
 previous=next;
 el('undo-edit').disabled=!undoStack.length;
 el('redo-edit').disabled=!redoStack.length;
 dirty=hasUnsavedChanges();
 status(dirty?'変更を自動保存します…':'保存済みです。');
 scheduleSave();
}
function restoreChange(from,to){
 if(!from.length)return;
 const focused=diagram.contains(document.activeElement);
 to.push(snapshot());
 const state=from.pop();
 layers=state.layers;marked.clear();dimensions=state.dimensions;venue=state.venue;assets=state.assets;background=state.background;setPlacement(null);renderPalette();drawStage();items=state.items;selectedId=state.selectedId;el('plan-name').value=state.title;
 previous=snapshot();
 dirty=hasUnsavedChanges();draw();updateInspector();scheduleSave();
 status(dirty?'変更を自動保存します…':'保存済みです。');
 if(focused&&selectedId)equipment.querySelector('[data-item="'+selectedId+'"]')?.focus({preventScroll:true});
}

function svg(tag,attrs){
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
 return node;
}

function setPlacement(kind){
 lineDraft=null;
 el('line-draft').replaceChildren();
 placing=kind;
 diagram.classList.toggle('placing',!!kind);
 for(const button of document.querySelectorAll('#palette button, #rigging-palette button'))
  button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
 el('placement-help').textContent=kind==='annotation-line'?'図面上で線の始点をクリックまたはタップしてください。':kind?toolFor(kind).label+'を置く位置をクリックまたはタップしてください。':'機材を選び、図面をクリックまたはタップして配置します。';
}

function updateInspector(){
 renderLayers();
 const item=selected();
 el('empty-selection').hidden=!!item;
 el('item-fields').hidden=!item;
 el('item-fields').disabled=locked(item);
 if(!item)return;
 el('item-name').value=item.name;
 el('item-name-label').textContent=item.kind==='annotation-text'?'テキスト':isRigging(item)?'左袖の表示名':'機材名';
 el('item-name').hidden=el('item-name-label').hidden=item.kind==='annotation-line';
 el('item-size-label').textContent=item.kind==='annotation-line'||isRigging(item)?'長さ（cm）':'幅（cm）';
 for(const node of el('item-fields').querySelectorAll('[data-equipment-only]'))node.hidden=isAnnotation(item);
 el('item-angle').value=item.angle;
 el('item-height').value=item.height;
 el('item-source').value=item.source||'venue';
 el('item-quantity').value=item.quantity??1;
 el('item-size-row').hidden=!dimensions;
 el('item-size').value=Math.round(symbolDimensions(item).width/(dimensions?geometry().scale:1));
 const pos=positionCm(item);
 el('item-x').value=dimensions?pos.x:'';el('item-y').value=dimensions?pos.y:'';
 el('item-x').disabled=el('item-y').disabled=!dimensions;
}

function toolFor(key){
 const asset=assets.find(entry=>entry.id===key);
 return asset?{label:asset.name,group:'imported',asset}:annotationTools[key]||tools[key];
}
function renderSchedule(){
 const root=el('schedule-tables');
 root.replaceChildren();
 for(const [key,title] of [['venue','借用会場備品'],['bring','持込機材']]){
  const section=document.createElement('section'),heading=document.createElement('h3');
  heading.textContent=title;
  section.append(heading);
  const counts=new Map();
  for(const item of items){
   if(isAnnotation(item)||(item.source||'venue')!==key)continue;
   const label=item.name||toolFor(item.assetId||item.kind).label;
   counts.set(label,(counts.get(label)||0)+(item.quantity??1));
  }
  if(!counts.size){const empty=document.createElement('p');empty.textContent='なし';section.append(empty);}
  else{
   const table=document.createElement('table');
   for(const [name,count] of counts){
    const row=table.insertRow();
    row.insertCell().textContent=name;
    row.insertCell().textContent=count+'点';
   }
   section.append(table);
  }
  root.append(section);
 }
}
const objectControls=el('object-controls');
function textLines(item){
 return item.name.split('\n').flatMap(line=>line.match(/.{1,12}/gu)||['']);
}
function textHeight(item){
 return Math.max(30,textLines(item).length*8+4);
}
function symbolDimensions(item){
 const tool=toolFor(item.assetId||item.kind),image=tool.asset||tool.source;
 const unit=dimensions?geometry().scale:1;
 const width=item.size!=null?item.size*unit:image?(dimensions?(tool.source?.size??60)*unit:48):90;
 return {width,height:isRigging(item)?10:width/(image?.ratio??(item.kind==='annotation-line'?9:item.kind==='annotation-text'?90/textHeight(item):(90/80)))};
}
function poseItem(group,item){
 const {width,height}=symbolDimensions(item);
 group.setAttribute('transform',`translate(${item.x} ${item.y})`);
 const body=group.querySelector('.object-body');
 body.setAttribute('transform',`rotate(${item.angle}) scale(${width/90} ${isRigging(item)?1:width/90})`);
 const label=group.querySelector('.object-name, .rigging-name');
 if(isRigging(item)){
  const end=rotateVector(width/2,0,item.angle);
  const left=end.x>=0?{x:-end.x,y:-end.y}:end;
  label.setAttribute('x',left.x+4);
  label.setAttribute('y',left.y-7);
 }else label.setAttribute('y',Math.max(20,height/2)+16);
}
let floatingFrame=0;
function scheduleFloatingActions(){
 if(floatingFrame)return;
 floatingFrame=requestAnimationFrame(()=>{
  floatingFrame=0;
  const toolbar=el('floating-actions');
  const nodes=Array.from(equipment.children).filter(node=>marked.size?
   marked.has(node.dataset.item):node.dataset.item===selectedId);
  if(!nodes.length||drag||diagram.querySelector('.diagram-text-editor')){toolbar.hidden=true;return;}
  const rects=nodes.map(node=>node.querySelector('.object-body').getBoundingClientRect());
  const object={left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),
   top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))};
  const scroll=el('diagram-scroll').getBoundingClientRect();
  if(object.right<=scroll.left||object.left>=scroll.right||object.bottom<=scroll.top||object.top>=scroll.bottom){
   toolbar.hidden=true;return;
  }
  toolbar.hidden=false;
  const frame=el('diagram-viewport').getBoundingClientRect();
  const width=toolbar.offsetWidth,height=toolbar.offsetHeight;
  const x=clamp((object.left+object.right-width)/2,scroll.left+6,Math.max(scroll.left+6,scroll.right-width-6));
  const above=object.top-height-14;
  const y=clamp(above>=scroll.top+4?above:object.bottom+14,scroll.top+4,Math.max(scroll.top+4,scroll.bottom-height-4));
  toolbar.style.left=(x-frame.left)+'px';toolbar.style.top=(y-frame.top)+'px';
 });
}
function drawControls(){
 objectControls.replaceChildren();
 const item=selected();
 scheduleFloatingActions();
 el('undo-edit').disabled=!undoStack.length;
 el('redo-edit').disabled=!redoStack.length;
 const fixed=locked(item),unavailable=!item||fixed;
 const multi=marked.size>1;
 el('float-group').hidden=!multi;
 el('float-group').disabled=layerSelection().some(locked);
 for(const id of ['float-edit','quick-lock','float-delete','quick-menu'])el(id).hidden=multi;
 const lock=el('quick-lock'),lockLabel=fixed?'ロック解除':'ロック';
 lock.setAttribute('aria-pressed',String(fixed));
 lock.setAttribute('aria-label',lockLabel);lock.title=lockLabel;
 for(const id of ['quick-properties','quick-position','quick-color','quick-opacity','quick-menu','float-edit','float-delete'])
  el(id).disabled=unavailable;
 el('quick-duplicate').disabled=!layerSelection().length||layerSelection().some(locked);
 el('quick-replace').disabled=unavailable||isAnnotation(item)||isRigging(item);
 el('quick-flip').disabled=unavailable||isAnnotation(item)||isRigging(item);
 el('quick-flip').setAttribute('aria-pressed',String(!!item?.flipX));
 if(!item)return;
 el('quick-color').value=item.color??toolFor(item.assetId||item.kind).color??'#474747';
 el('quick-opacity').value=item.opacity??100;
 if(fixed)return;
 const {width,height}=symbolDimensions(item);
 const x=width/2,y=height/2;
 const scale=diagram.getScreenCTM()?.a||1;
 const grip=clamp(5/Math.abs(scale),2,24);
 const target=clamp(12/Math.abs(scale),5,36);
 const gripX=Math.max(x,1.2*target),gripY=Math.max(y,1.2*target);
 const offset=clamp(26/Math.abs(scale),10,60);
 const controls=svg('g',{transform:`translate(${item.x} ${item.y}) rotate(${item.angle})`});
 controls.append(svg('rect',{x:-x,y:-y,width,height,class:'object-outline'}));
 controls.append(svg('line',{x1:0,y1:y,x2:0,y2:gripY+offset,class:'object-outline'}));
 const grips=isRigging(item)?[['w',-gripX,0],['e',gripX,0]]:
  [['nw',-gripX,-gripY],['ne',gripX,-gripY],['sw',-gripX,gripY],['se',gripX,gripY]];
 for(const [corner,cx,cy] of [...grips,['rotate',0,gripY+offset]]){
  controls.append(svg('circle',{cx,cy,r:target,class:'object-grip-target','data-grip':corner}));
  controls.append(svg('circle',{cx,cy,r:grip,class:'object-grip'}));
 }
 objectControls.append(controls);
 if(drag?.grip==='rotate'&&drag.item===item){
  const handle=rotateVector(0,gripY+offset,item.angle);
  const badge=svg('g',{class:'rotation-angle',transform:`translate(${item.x+handle.x} ${item.y+handle.y}) scale(${1/Math.abs(scale)})`});
  badge.append(svg('rect',{x:13,y:-12,width:52,height:24,rx:6}));
  const label=svg('text',{x:39,y:4,'text-anchor':'middle'});
  label.textContent=item.angle+'°';
  badge.append(label);objectControls.append(badge);
 }
}
function draw(){
 equipment.replaceChildren();
 for(const item of orderedItems().filter(visible)){
  const tool=toolFor(item.assetId||item.kind);
  const group=svg('g',{tabindex:0,role:'button','aria-label':item.name||tool.label,
   'aria-pressed':String(marked.has(item.id)||groupOf(selected()).includes(item)),class:'equipment-item','data-item':item.id});
  const body=svg('g',{class:'object-body',fill:item.color??tool.color,color:item.color??tool.color});
  const imported=tool.asset||tool.source;
  const height=imported?90/imported.ratio:item.kind==='annotation-line'||tool.group==='rigging'?10:item.kind==='annotation-text'?textHeight(item):80;
  body.append(svg('rect',{x:-45,y:-height/2,width:90,height,fill:'transparent'}));
  const symbol=svg('g',{opacity:(item.opacity??100)/100,transform:item.flipX?'scale(-1 1)':'scale(1)'});
  if(imported){
   const image=svg('image',{x:-45,y:-height/2,width:90,height});
   if(item.color){
    const maskId='object-color-'+item.id;
    const mask=svg('mask',{id:maskId,style:'mask-type:alpha',maskUnits:'userSpaceOnUse',x:-45,y:-height/2,width:90,height});
    mask.append(image);
    symbol.append(mask,svg('rect',{x:-45,y:-height/2,width:90,height,fill:item.color,mask:'url(#'+maskId+')'}));
   }else symbol.append(image);
   if(tool.asset)image.setAttribute('href',tool.asset.data);
   else loadSourceImage(item.kind).then(data=>image.setAttribute('href',data)).catch(()=>{if(image.isConnected)status('オブジェクトを読み込めませんでした。図面を開き直してください。');});
  }else if(item.kind==='annotation-line'){
   symbol.append(svg('line',{x1:-45,y1:0,x2:45,y2:0,stroke:item.color??tool.color,'stroke-width':2,'vector-effect':'non-scaling-stroke'}));
  }else if(item.kind==='annotation-text'){
   const lines=textLines(item);
   const text=svg('text',{x:-43,y:0,class:'annotation-text',...(item.color?{style:'fill:'+item.color}:{})});
   lines.forEach((line,index)=>{
    const span=svg('tspan',{x:-43,y:(index-(lines.length-1)/2)*8+2.5});
    span.textContent=line;text.append(span);
   });
   symbol.append(text);
  }else symbol.innerHTML=tool.shape;
  const label=svg('text',{class:isRigging(item)?'rigging-name':'object-name','pointer-events':isRigging(item)?'bounding-box':'none'});
  label.textContent=isRigging(item)?item.name:isAnnotation(item)?'':item.name||tool.label;
  body.append(symbol);group.append(body,label);equipment.append(group);
  poseItem(group,item);
 }
 expandForItems();
 drawControls();
 renderSchedule();
}

function point(event,limit=true){
 const pos=new DOMPoint(event.clientX,event.clientY).matrixTransform(diagram.getScreenCTM().inverse());
 return limit?{x:Math.round(worldCoordinate(pos.x)),y:Math.round(worldCoordinate(pos.y))}:{x:pos.x,y:pos.y};
}
function rotateVector(x,y,angle){
 const r=angle*Math.PI/180;
 return {x:x*Math.cos(r)-y*Math.sin(r),y:x*Math.sin(r)+y*Math.cos(r)};
}

function snapPosition(pos){
 if(!dimensions)return pos;
 const frame=geometry(),cm=positionCm(pos,frame);
 const snapped=positionSvg(cm.x,cm.y,frame);
 return {x:worldCoordinate(snapped.x),y:worldCoordinate(snapped.y)};
}
function alignmentBox(item,x=item.x,y=item.y){
 const {width,height}=symbolDimensions(item);
 const corner=rotateVector(1,0,item.angle);
 const halfX=(Math.abs(corner.x)*width+Math.abs(corner.y)*height)/2;
 const halfY=(Math.abs(corner.y)*width+Math.abs(corner.x)*height)/2;
 return {left:x-halfX,right:x+halfX,top:y-halfY,bottom:y+halfY};
}
function alignmentTarget(moving,others,axis,tolerance){
 const horizontal=axis==='x';
 const [start,end,near,far]=horizontal?['left','right','top','bottom']:['top','bottom','left','right'];
 const mid=(moving[start]+moving[end])/2,size=moving[end]-moving[start];
 const cross=(moving[near]+moving[far])/2;
 const frame=geometry();
 let best={delta:0,guides:[]},distance=tolerance;
 function consider(delta,guides){
  if(Math.abs(delta)>=distance)return;
  best={delta,guides};distance=Math.abs(delta);
 }
 function align(coordinate,anchor,from,to){
  consider(coordinate-anchor,[[coordinate,from,coordinate,to]]);
 }
 align(horizontal?frame.x+frame.w/2:frame.y+frame.h/2,mid,
  Math.min(horizontal?frame.y:frame.x,moving[near]),Math.max(horizontal?frame.y+frame.h:frame.x+frame.w,moving[far]));
 const lane=others.filter(box=>box[near]<moving[far]+tolerance&&box[far]>moving[near]-tolerance)
  .sort((a,b)=>a[start]-b[start]);
 for(let i=1;i<lane.length;i++){
  const a=lane[i-1],b=lane[i],gap=b[start]-a[end];
  if(gap<=0)continue;
  const existing=[a[end],cross,b[start],cross];
  consider(b[end]+gap-moving[start],[existing,[b[end],cross,b[end]+gap,cross]]);
  consider(a[start]-gap-moving[end],[existing,[a[start]-gap,cross,a[start],cross]]);
  if(gap>size){
   const spacing=(gap-size)/2;
   consider(a[end]+spacing-moving[start],[[a[end],cross,a[end]+spacing,cross],[b[start]-spacing,cross,b[start],cross]]);
  }
 }
 for(const box of others){
  const from=Math.min(box[near],moving[near]),to=Math.max(box[far],moving[far]);
  align((box[start]+box[end])/2,mid,from,to);
  align(box[start],moving[start],from,to);
  align(box[end],moving[end],from,to);
 }
 return best;
}
function magneticOffset(members,dx,dy,disabled){
 const guides=el('snap-guides');guides.replaceChildren();
 const scale=Math.abs(diagram.getScreenCTM()?.a||0);
 if(disabled||!scale)return {dx,dy};
 const moving=members.map(({entry,x,y})=>alignmentBox(entry,x+dx,y+dy));
 const bounds={left:Math.min(...moving.map(b=>b.left)),right:Math.max(...moving.map(b=>b.right)),
  top:Math.min(...moving.map(b=>b.top)),bottom:Math.max(...moving.map(b=>b.bottom))};
 const excluded=new Set(members.map(({entry})=>entry));
 const others=items.filter(item=>!excluded.has(item)&&visible(item)).map(item=>alignmentBox(item));
 for(const axis of ['x','y']){
  const {delta,guides:lines}=alignmentTarget(bounds,others,axis,8/scale);
  if(axis==='x')dx+=delta;else dy+=delta;
  for(const line of lines){
   const [x1,y1,x2,y2]=axis==='x'?line:[line[1],line[0],line[3],line[2]];
   guides.append(svg('line',{x1,y1,x2,y2}));
  }
 }
 return {dx,dy};
}
function addItem(position){
 if(items.length>=200){status('1つの図面に配置できる機材は200件までです。');return;}
 const tool=toolFor(placing);
 const item={id:crypto.randomUUID(),kind:tool.asset?'imported-svg':placing,...(tool.asset?{assetId:tool.asset.id,size:60}:tool.source?{size:tool.source.size}:tool.group==='rigging'?{size:600}:placing==='annotation-text'?{size:250}:{}),name:tool.label,...snapPosition(position),angle:0,height:0};
 if(isRigging(item)){
  const suffix=item.kind==='sus'?'SUS':'美術バトン';
  const names=new Set(items.filter(entry=>entry.kind===item.kind).map(entry=>entry.name));
  let number=1;
  while(names.has(number+suffix))number++;
  item.name=number+suffix;
 }
 item.layerId=placementLayer();
 items.push(item);
 marked.clear();selectedId=item.id;
 setPlacement(null);
 changed();draw();updateInspector();
 recordRecentObject(item.kind);
 if(item.kind==='annotation-text')editText(item);
}

function bindPaletteDrag(button,handle,kind,label){
 let gesture,suppressClick=false;
 button.addEventListener('pointerdown',event=>{
  suppressClick=false;
  if(event.button!==0||event.pointerType!=='mouse'&&!handle.contains(event.target))return;
  gesture={pointer:event.pointerId,x:event.clientX,y:event.clientY,epoch:planEpoch,ghost:null};
  button.setPointerCapture(event.pointerId);
 });
 const isOverDiagram=event=>diagram.contains(document.elementFromPoint(event.clientX,event.clientY));
 button.addEventListener('pointermove',event=>{
  if(gesture?.pointer!==event.pointerId)return;
  if(!gesture.ghost&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<6)return;
  if(!gesture.ghost){
   gesture.ghost=document.createElement('div');
   gesture.ghost.className='palette-drag-ghost';
   gesture.ghost.textContent=label;
   document.body.append(gesture.ghost);
  }
  gesture.ghost.style.left=event.clientX+12+'px';
  gesture.ghost.style.top=event.clientY+12+'px';
  diagram.classList.toggle('drop-ready',isOverDiagram(event));
 });
 const cleanup=()=>{
  gesture?.ghost?.remove();
  gesture=null;
  diagram.classList.remove('drop-ready');
 };
 button.addEventListener('pointerup',event=>{
  if(gesture?.pointer!==event.pointerId)return;
  suppressClick=!!gesture.ghost;
  if(suppressClick&&gesture.epoch===planEpoch&&isOverDiagram(event)){
   setPlacement(kind);
   if(kind==='annotation-line')startLine(point(event));
   else addItem(point(event));
  }
  cleanup();
 });
 button.addEventListener('lostpointercapture',cleanup);
 button.onclick=()=>{
  if(suppressClick){suppressClick=false;return;}
  setPlacement(placing===kind?null:kind);
 };
}
const palettePreviews=new IntersectionObserver(entries=>{
 for(const {target,isIntersecting} of entries){
  if(!isIntersecting)continue;
  palettePreviews.unobserve(target);
  const image=target.querySelector('image');
  loadSourceImage(target.dataset.kind).then(data=>image.setAttribute('href',data)).catch(()=>{
   const unavailable=svg('text',{x:0,y:0,'text-anchor':'middle','dominant-baseline':'central'});
   unavailable.textContent='—';
   image.replaceWith(unavailable);
   target.title='プレビューを読み込めませんでした';
  });
 }
},{rootMargin:'100px'});
function recordRecentObject(kind){
 if(!tools[kind]?.source||recentObjects[0]===kind)return;
 recentObjects=[kind,...recentObjects.filter(entry=>entry!==kind)].slice(0,recentLimit);
 if(recentObjectsKey)try{localStorage.setItem(recentObjectsKey,JSON.stringify(recentObjects));}catch{}
 if(el('equipment-category').value==='recent'&&!el('equipment-search').value.trim())renderPalette();
}
function renderPalette(){
 const palette=el('palette'),category=el('equipment-category').value;
 const query=el('equipment-search').value.trim().normalize('NFKC').toLowerCase();
 const showingRecent=category==='recent'&&!query;
 const matches=showingRecent
  ?recentObjects.filter(kind=>tools[kind]?.source).map(kind=>[kind,tools[kind]])
  :Object.entries(tools).filter(([kind,tool])=>
   tool.source&&(category==='recent'||category==='source'||tool.group===category)&&
   (tool.label.normalize('NFKC').toLowerCase().includes(query)||kind.includes(query)));
 palettePreviews.disconnect();
 palette.replaceChildren();
 el('equipment-count').textContent=showingRecent&&!matches.length
  ?'最近使った素材はまだありません。「すべて」から選ぶか、素材名で検索してください。'
  :matches.length+'件';
 palette.append(...matches.map(([kind,tool])=>paletteButton(kind,tool)));
 for(const button of palette.children)palettePreviews.observe(button);
 el('rigging-palette').replaceChildren(...Object.entries(tools)
  .filter(([,tool])=>tool.group==='rigging')
  .map(([kind,tool])=>paletteButton(kind,tool)));
}
function paletteButton(kind,tool){
 const button=document.createElement('button');
 button.type='button';button.dataset.kind=kind;
 button.setAttribute('aria-pressed',String(kind===placing));
 const icon=svg('svg',{viewBox:'-45 -40 90 80',fill:tool.color,color:tool.color,'aria-hidden':'true'});
 if(tool.asset)icon.append(svg('image',{href:tool.asset.data,x:-36,y:-36,width:72,height:72}));
 else if(tool.source)icon.append(svg('image',{x:-43,y:-37,width:86,height:74}));
 else icon.innerHTML=tool.shape;
 const name=document.createElement('span'),handle=document.createElement('span');
 name.textContent=tool.label;
 handle.className='palette-grip';handle.textContent='⠿';handle.setAttribute('aria-hidden','true');
 button.append(icon,name,handle);
 bindPaletteDrag(button,handle,kind,tool.label);
 return button;
}
el('equipment-category').onchange=renderPalette;
el('equipment-search').oninput=renderPalette;

function editText(item){
 if(locked(item))return;
 const group=equipment.querySelector('[data-item="'+item.id+'"]');
 if(!group||group.querySelector('textarea'))return;
 const rigging=isRigging(item);
 const body=rigging?group:group.querySelector('.object-body');
 const text=body.querySelector(rigging?'.rigging-name':'.annotation-text');
 lastObjectTap=null;
 const box=svg('foreignObject',rigging?{x:text.getAttribute('x'),width:150,class:'rigging-editor'}:{x:-45,width:90});
 const editor=document.createElement('textarea');
 editor.className='diagram-text-editor';
 editor.setAttribute('aria-label',rigging?'左袖の表示名':'図面上のテキスト');
 editor.maxLength=80;
 editor.value=item.name;
 const resize=()=>{
  const height=rigging?26:textHeight({name:editor.value});
  box.setAttribute('y',rigging?Number(text.getAttribute('y'))-17:-height/2);
  box.setAttribute('height',height);
 };
 resize();
 editor.addEventListener('input',resize);
 editor.addEventListener('pointerdown',event=>event.stopPropagation());
 editor.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.isComposing)return;
  if(event.key==='Escape'||event.key==='Enter'&&(rigging||event.metaKey||event.ctrlKey)){
   event.preventDefault();
   if(event.key==='Escape')editor.value=item.name;
   editor.blur();
   if(group.isConnected)group.focus({preventScroll:true});
  }
 });
 editor.addEventListener('blur',()=>{
  if(!box.isConnected)return;
  box.remove();text.style.visibility='';scheduleFloatingActions();
  const value=rigging?editor.value.replace(/\s*\n\s*/g,' ').trim():editor.value.trim()||'テキスト';
  if(value===item.name)return;
  item.name=value;changed();draw();updateInspector();
 },{once:true});
 text.style.visibility='hidden';
 box.append(editor);body.append(box);scheduleFloatingActions();
 editor.focus({preventScroll:true});editor.select();
}

function startLine(start){
 const preview=svg('line',{x1:start.x,y1:start.y,x2:start.x,y2:start.y,stroke:'#7c3aed','stroke-width':2,'vector-effect':'non-scaling-stroke'});
 el('line-draft').append(preview,svg('circle',{cx:start.x,cy:start.y,r:3,fill:'#7c3aed'}));
 lineDraft={start,preview};
 el('placement-help').textContent='線の終点をクリックまたはタップしてください。Escで取り消せます。';
}

function lineEnd(event,start){
 const end=point(event);
 if(!event.shiftKey)return end;
 const dx=end.x-start.x,dy=end.y-start.y;
 const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4),length=Math.hypot(dx,dy);
 return {x:worldCoordinate(start.x+length*Math.cos(angle)),y:worldCoordinate(start.y+length*Math.sin(angle))};
}

let touchPlacement=null;
function placeOnDiagram(event){
 if(placing==='annotation-line'){
  if(lineDraft){
   const {start}=lineDraft;
   const end=lineEnd(event,start);
   const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
   if(length<2)return;
   if(items.length>=200){status('図面に配置できる項目は200件までです。');return;}
   const item={id:crypto.randomUUID(),kind:'annotation-line',name:'線',x:(start.x+end.x)/2,y:(start.y+end.y)/2,
    angle:(Math.round(Math.atan2(dy,dx)*180/Math.PI)+360)%360,height:0,
    size:clamp(Math.round(length/(dimensions?geometry().scale:1)),1,20000)};
   item.layerId=placementLayer();
   items.push(item);marked.clear();selectedId=item.id;setPlacement(null);changed();draw();updateInspector();
   return;
  }
  startLine(point(event));
  return;
 }
 addItem(point(event));
}
diagram.addEventListener('pointerdown',event=>{
 if(event.button!==0||!event.isPrimary||drag||spaceDown||event.target.closest('textarea'))return;
 if(placing&&(event.pointerType==='touch'||placing==='annotation-line')){
  event.preventDefault();
  if(event.pointerType==='touch'){
   touchPlacement={pointer:event.pointerId,x:event.clientX,y:event.clientY,kind:placing};
  }else placeOnDiagram(event);
  return;
 }
 const grip=event.target.closest('[data-grip]')?.dataset.grip;
 if(grip&&selected()&&!locked(selected())){
  event.preventDefault();
  const item=selected(),{width,height}=symbolDimensions(item);
  drag={pointer:event.pointerId,item,grip,width,height,x:item.x,y:item.y,angle:item.angle,start:point(event,false),clientX:event.clientX,clientY:event.clientY};
  diagram.setPointerCapture(event.pointerId);
  if(grip==='rotate')drawControls();
  return;
 }
 if(placing){event.preventDefault();addItem(point(event));return;}
 const target=event.target.closest('[data-item]');
 if(!target){marked.clear();selectedId=null;draw();updateInspector();return;}
 const toggleSelection=event.metaKey||event.shiftKey;
 const preserveSelection=!toggleSelection&&marked.size>1&&marked.has(target.dataset.item);
 if(event.target.closest('.rigging-name')&&!toggleSelection&&!preserveSelection){
  selectedId=target.dataset.item;
  marked.clear();
  for(const node of equipment.children)node.setAttribute('aria-pressed',String(groupOf(selected()).some(item=>item.id===node.dataset.item)));
  drawControls();updateInspector();
  return;
 }
 const priorSelection=selected();
 selectedId=target.dataset.item;
 const item=selected(),start=point(event);
 if(toggleSelection){
  event.preventDefault();
  if(!marked.size)for(const member of groupOf(priorSelection))marked.add(member.id);
  const members=groupOf(item),remove=members.every(member=>marked.has(member.id));
  for(const member of members){
   if(remove)marked.delete(member.id);else marked.add(member.id);
  }
  selectedId=marked.size===1?marked.values().next().value:null;
  if(selectedId)marked.clear();
  draw();updateInspector();return;
 }
 const members=preserveSelection?[...new Set(layerSelection().flatMap(groupOf))]:groupOf(item);
 if(preserveSelection)selectedId=null;else marked.clear();
 if(members.some(locked)){
  target.focus({preventScroll:true});draw();updateInspector();return;
 }
 drag={pointer:event.pointerId,item,start,x:item.x,y:item.y,clientX:event.clientX,clientY:event.clientY,members:members.map(entry=>({entry,x:entry.x,y:entry.y}))};
 diagram.setPointerCapture(event.pointerId);
 target.focus({preventScroll:true});
 for(const node of equipment.children)node.setAttribute('aria-pressed',String(members.some(member=>member.id===node.dataset.item)));
 drawControls();updateInspector();
});
diagram.addEventListener('pointermove',event=>{
 if(event.pointerType==='touch'&&touchTap?.points.size>1)return;
 if(touchPlacement?.pointer===event.pointerId&&Math.hypot(event.clientX-touchPlacement.x,event.clientY-touchPlacement.y)>10)
  touchPlacement=null;
 if(lineDraft){
  const end=lineEnd(event,lineDraft.start);
  lineDraft.preview.setAttribute('x2',end.x);lineDraft.preview.setAttribute('y2',end.y);
  return;
 }
 if(!drag||event.pointerId!==drag.pointer)return;
 if(event.pointerType==='touch'&&!drag.undoRecorded&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<=10)return;
 const item=drag.item;
 const before=[item.x,item.y,item.angle,item.size].join(',');
 const end=point(event,!drag.grip);
 if(drag.grip==='rotate'){
  const angle=Math.atan2(end.y-item.y,end.x-item.x)*180/Math.PI-90;
  const step=event.shiftKey?15:1;
  item.angle=(Math.round(angle/step)*step+360)%360;
 }else if(drag.grip){
  const sx=drag.grip.endsWith('e')?1:-1,sy=isRigging(item)?0:drag.grip.startsWith('s')?1:-1;
  const vector=rotateVector(sx*drag.width,sy*drag.height,drag.angle);
  const anchor={x:drag.x-vector.x/2,y:drag.y-vector.y/2};
  const factor=1+((end.x-drag.start.x)*vector.x+(end.y-drag.start.y)*vector.y)/(vector.x**2+vector.y**2);
  const unit=dimensions?geometry().scale:1;
  const size=clamp(Math.round(drag.width*factor/unit),1,20000);
  const ratio=size*unit/drag.width;
  const x=anchor.x+vector.x*ratio/2,y=anchor.y+vector.y*ratio/2;
  if(inWorld({x,y}))Object.assign(item,{size,x,y});
 }else{
  const target=snapPosition({x:drag.x+end.x-drag.start.x,y:drag.y+end.y-drag.start.y});
  const magnetic=magneticOffset(drag.members,target.x-drag.x,target.y-drag.y,event.altKey);
  const dx=clamp(magnetic.dx,Math.max(...drag.members.map(m=>-WORLD_LIMIT-m.x)),Math.min(...drag.members.map(m=>WORLD_LIMIT-m.x)));
  const dy=clamp(magnetic.dy,Math.max(...drag.members.map(m=>-WORLD_LIMIT-m.y)),Math.min(...drag.members.map(m=>WORLD_LIMIT-m.y)));
  for(const {entry,x,y} of drag.members){
   Object.assign(entry,{x:x+dx,y:y+dy});
   const node=equipment.querySelector('[data-item="'+entry.id+'"]');
   if(node)poseItem(node,entry);
  }
 }
 if(before===[item.x,item.y,item.angle,item.size].join(','))return;
 poseItem(equipment.querySelector('[data-item="'+item.id+'"]'),item);
 expandForItems();
 drawControls();
 changed();
});
diagram.addEventListener('pointerup',event=>{
 if(touchPlacement?.pointer===event.pointerId){
  const pending=touchPlacement;touchPlacement=null;
  if(placing===pending.kind&&Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<=10)placeOnDiagram(event);
  return;
 }
 if(event.pointerType==='touch'&&touchTap?.points.size>1)return;
 const label=event.target.closest('.rigging-name');
 const item=selected();
 if(!item||placing||locked(item))return;
 if(label&&!drag){
  if(item.id!==label.closest('[data-item]').dataset.item)return;
 }else{
  if(drag?.pointer!==event.pointerId||drag.grip||drag.item!==item)return;
  if(drag.undoRecorded||Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)>6){
   lastObjectTap=null;
   return;
  }
 }
 const {clientX:x,clientY:y,timeStamp:time}=event,previous=lastObjectTap;
 lastObjectTap={item,x,y,time,label:!!label};
 if(previous?.item!==item||previous.label!==!!label||time-previous.time>=450||Math.hypot(x-previous.x,y-previous.y)>8)return;
 lastObjectTap=null;
 requestAnimationFrame(()=>{
  if(selected()!==item||placing)return;
  if(label)editText(item);else editSelected();
 });
});
diagram.addEventListener('lostpointercapture',()=>{
 const rotating=drag?.grip==='rotate';
 drag=null;el('snap-guides').replaceChildren();
 if(rotating)drawControls();
 updateInspector();scheduleSave();scheduleFloatingActions();
});
diagram.addEventListener('keydown',event=>{
 const node=event.target.closest('[data-item]');
 if(!node)return;
 const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 const direction=arrows[event.key];
 if(!direction&&event.key!=='Enter'&&event.key!==' ')return;
 event.preventDefault();
 selectedId=node.dataset.item;
 const item=selected();
 if(event.key==='Enter'&&(item.kind==='annotation-text'||isRigging(item))){editText(item);return;}
 if(direction&&!locked(item)){
  const step=dimensions?(event.shiftKey?10:1)*geometry().scale:(event.shiftKey?25:5);
  const members=groupOf(item);
  const dx=clamp(step*direction[0],Math.max(...members.map(entry=>-WORLD_LIMIT-entry.x)),Math.min(...members.map(entry=>WORLD_LIMIT-entry.x)));
  const dy=clamp(step*direction[1],Math.max(...members.map(entry=>-WORLD_LIMIT-entry.y)),Math.min(...members.map(entry=>WORLD_LIMIT-entry.y)));
  for(const entry of members){entry.x+=dx;entry.y+=dy;}
  changed();
 }
 draw();updateInspector();
 equipment.querySelector('[data-item="'+selectedId+'"]').focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.isComposing||el('plan-editor').hidden||document.querySelector('dialog[open]')||!el('object-menu').hidden)return;
 const key=event.key.toLowerCase(),command=event.metaKey||event.ctrlKey;
 if(command&&!event.altKey&&key==='s'){
  event.preventDefault();savePlan(true);return;
 }
 if(event.target.closest?.('input, textarea, select, [contenteditable]'))return;
 if(command&&!event.altKey&&key==='d'&&(selected()||marked.size)){
  event.preventDefault();duplicateSelected();return;
 }
 if(command&&!event.altKey&&(key==='z'||key==='y')){
  event.preventDefault();
  if(key==='y'||event.shiftKey)restoreChange(redoStack,undoStack);
  else restoreChange(undoStack,redoStack);
 }else if(!command&&!event.altKey){
  if(key==='escape'&&placing)setPlacement(null);
  if(['+','=','-'].includes(key)){event.preventDefault();setZoom(zoom+(key==='-'?-25:25));}
  if((key==='delete'||key==='backspace')&&selected()){
   event.preventDefault();el('remove-item').click();
  }

 }
});
el('undo-edit').onclick=()=>restoreChange(undoStack,redoStack);
el('redo-edit').onclick=()=>restoreChange(redoStack,undoStack);
el('quick-duplicate').onclick=duplicateSelected;
function editSelected(){
 const item=selected();if(!item||locked(item))return;
 if(item.kind==='annotation-text'){editText(item);return;}
 showToolPanel('properties');
 if(item.kind==='annotation-line')el('item-angle').focus();
 else{el('item-name').focus();el('item-name').select();}
}
function editToolbarItem(update){
 const item=selected();
 if(!item||locked(item))return;
 update(item);changed();draw();updateInspector();
}
el('quick-lock').onclick=()=>{
 const item=selected();
 if(!item)return;
 const fixed=locked(item);
 for(const member of groupOf(item)){
  if(fixed)delete member.locked;else member.locked=true;
 }
 changed();draw();updateInspector();
};
el('quick-color').onchange=event=>editToolbarItem(item=>{item.color=event.target.value;});
el('quick-opacity').onchange=event=>editToolbarItem(item=>{item.opacity=Number(event.target.value);});
el('quick-flip').onclick=()=>editToolbarItem(item=>{
 if(item.flipX)delete item.flipX;else item.flipX=true;
});
el('quick-position').onclick=()=>{
 showToolPanel('properties');
 el(dimensions?'item-x':'item-angle').focus();
};
const replaceDialog=el('replace-object');
let replaceId=null;
function filterReplacements(){
 const query=el('replace-search').value.trim().normalize('NFKC').toLowerCase();
 const options=Object.entries(tools).filter(([,tool])=>tool.source&&tool.label.normalize('NFKC').toLowerCase().includes(query));
 el('replace-kind').replaceChildren(...options.map(([key,tool])=>new Option(tool.label,key)));
}
el('replace-search').oninput=filterReplacements;
el('quick-replace').onclick=()=>{
 replaceId=selected()?.id;
 if(!replaceId)return;
 replaceDialog.returnValue='';
 el('replace-search').value='';filterReplacements();replaceDialog.showModal();
 el('replace-search').focus();
};
replaceDialog.addEventListener('close',()=>{
 if(replaceDialog.returnValue!=='apply'||selected()?.id!==replaceId)return;
 const kind=el('replace-kind').value,tool=tools[kind];
 if(!tool?.source)return;
 editToolbarItem(item=>{
  if(item.kind===kind)return;
  item.kind=kind;item.name=tool.label;item.size=tool.source.size;
  recordRecentObject(kind);
  delete item.assetId;
 });
});
el('quick-properties').onclick=editSelected;
el('float-edit').onclick=editSelected;
el('float-delete').onclick=()=>el('remove-item').click();
el('float-group').onclick=()=>el('group-items').click();
el('quick-menu').onclick=()=>{
 const button=el('quick-menu'),box=button.getBoundingClientRect();
 showObjectMenu(box.left,box.bottom+4,button);
};
let spaceDown=false,pan=null;
const editableTarget=target=>target.closest?.('input,textarea,select,button,[contenteditable]');
document.addEventListener('keydown',event=>{
 if(event.code!=='Space'||editableTarget(event.target)||el('plan-editor').hidden||document.querySelector('dialog[open]'))return;
 if(event.target.closest?.('[data-item]'))return;
 event.preventDefault();spaceDown=true;diagramScroll.classList.add('pan-ready');
});
function stopPanning(){spaceDown=false;pan=null;diagramScroll.classList.remove('pan-ready','panning');}
document.addEventListener('keyup',event=>{if(event.code==='Space')stopPanning();});
window.addEventListener('blur',stopPanning);
const diagramScroll=el('diagram-scroll');
diagramScroll.addEventListener('pointerdown',event=>{
 if(!spaceDown||event.button!==0)return;
 event.preventDefault();
 pan={id:event.pointerId,x:event.clientX,y:event.clientY,left:diagramScroll.scrollLeft,top:diagramScroll.scrollTop};
 diagramScroll.classList.add('panning');
 diagramScroll.setPointerCapture(event.pointerId);
},true);
diagramScroll.addEventListener('pointermove',event=>{
 if(pan?.id!==event.pointerId)return;
 extendAtEdge(pan.left+pan.x-event.clientX-diagramScroll.scrollLeft,pan.top+pan.y-event.clientY-diagramScroll.scrollTop);
 diagramScroll.scrollLeft=pan.left+pan.x-event.clientX;
 diagramScroll.scrollTop=pan.top+pan.y-event.clientY;
});
diagramScroll.addEventListener('lostpointercapture',()=>{
 pan=null;diagramScroll.classList.remove('panning');
});
const WORLD_LIMIT=1000000,CANVAS_CHUNK=500;
const defaultCanvas={left:0,top:0,right:1000,bottom:650};
let canvasBounds=defaultCanvas;
const worldCoordinate=value=>clamp(value,-WORLD_LIMIT,WORLD_LIMIT);
const inWorld=({x,y})=>Math.abs(x)<=WORLD_LIMIT&&Math.abs(y)<=WORLD_LIMIT;
function canvasWidth(){return canvasBounds.right-canvasBounds.left;}
function canvasHeight(){return canvasBounds.bottom-canvasBounds.top;}
function sizeCanvas(){
 diagram.style.setProperty('--diagram-zoom',zoom*canvasWidth()/1000+'%');
}
function updateCanvas(bounds,preserve=true){
 const scale=diagram.getBoundingClientRect().width/canvasWidth();
 const dx=(canvasBounds.left-bounds.left)*scale,dy=(canvasBounds.top-bounds.top)*scale;
 canvasBounds=bounds;
 const attrs={x:bounds.left,y:bounds.top,width:canvasWidth(),height:canvasHeight()};
 diagram.setAttribute('viewBox',Object.values(attrs).join(' '));
 for(const id of ['canvas-paper','grid'])
  for(const [key,value] of Object.entries(attrs))el(id).setAttribute(key,value);
 sizeCanvas();
 if(preserve){
  diagramScroll.scrollLeft+=dx;diagramScroll.scrollTop+=dy;
  if(pan){pan.left+=dx;pan.top+=dy;}
 }
 scheduleViewportRulers();scheduleFloatingActions();
}
function contentBounds(base){
 const bounds={...base};
 for(const item of items){
  if(!visible(item))continue;
  const {width,height}=symbolDimensions(item);
  const radius=Math.hypot(width,height)/2+45;
  bounds.left=Math.min(bounds.left,item.x-radius);
  bounds.top=Math.min(bounds.top,item.y-radius);
  bounds.right=Math.max(bounds.right,item.x+radius);
  bounds.bottom=Math.max(bounds.bottom,item.y+radius);
 }
 return bounds;
}
function expandForItems(){
 const needed=contentBounds(canvasBounds),bounds={...canvasBounds};
 for(const key of ['left','top','right','bottom']){
  const delta=needed[key]-bounds[key];
  if(delta)bounds[key]+=Math.sign(delta)*Math.ceil(Math.abs(delta)/CANVAS_CHUNK)*CANVAS_CHUNK;
 }
 if(Object.keys(bounds).some(key=>bounds[key]!==canvasBounds[key]))updateCanvas(bounds);
}
function extendAtEdge(dx,dy){
 const bounds={...canvasBounds},edge=36;
 const {scrollLeft,scrollTop,clientWidth,clientHeight,scrollWidth,scrollHeight}=diagramScroll;
 if(dx<0&&scrollLeft<edge)bounds.left=Math.max(Math.min(bounds.left,-WORLD_LIMIT-CANVAS_CHUNK),bounds.left-CANVAS_CHUNK);
 if(dx>0&&scrollWidth-clientWidth-scrollLeft<edge)bounds.right=Math.min(Math.max(bounds.right,WORLD_LIMIT+CANVAS_CHUNK),bounds.right+CANVAS_CHUNK);
 if(dy<0&&scrollTop<edge)bounds.top=Math.max(Math.min(bounds.top,-WORLD_LIMIT-CANVAS_CHUNK),bounds.top-CANVAS_CHUNK);
 if(dy>0&&scrollHeight-clientHeight-scrollTop<edge)bounds.bottom=Math.min(Math.max(bounds.bottom,WORLD_LIMIT+CANVAS_CHUNK),bounds.bottom+CANVAS_CHUNK);
 if(Object.keys(bounds).some(key=>bounds[key]!==canvasBounds[key]))updateCanvas(bounds);
}
let touchPan=null,touchTap=null;
function trackTouchTravel(touches){
 if(!touchTap)return;
 for(const touch of touches){
  const start=touchTap.points.get(touch.identifier);
  if(start&&Math.hypot(touch.clientX-start.clientX,touch.clientY-start.clientY)>10)touchTap.valid=false;
 }
}
diagramScroll.addEventListener('touchstart',event=>{
 if(!touchTap)touchTap={start:event.timeStamp,points:new Map(),valid:!event.target.closest('textarea'),overlap:false};
 for(const touch of event.changedTouches)touchTap.points.set(touch.identifier,touch);
 if(touchTap.points.size>2)touchTap.valid=false;
 if(event.touches.length===2)touchTap.overlap=true;
 if(touchTap.points.size>1)touchPlacement=null;
 touchPan=event.touches.length===1?event.touches[0]:null;
},{passive:true});
diagramScroll.addEventListener('touchmove',event=>{
 trackTouchTravel(event.changedTouches);
 if(event.touches.length!==1){touchPan=null;return;}
 const touch=event.touches[0];
 if(touchPan&&!drag&&!placing)extendAtEdge(touchPan.clientX-touch.clientX,touchPan.clientY-touch.clientY);
 touchPan=touch;
},{passive:true});
diagramScroll.addEventListener('touchend',event=>{
 touchPan=null;
 trackTouchTravel(event.changedTouches);
 if(event.touches.length||!touchTap)return;
 const tap=touchTap;touchTap=null;
 if(tap.valid&&tap.overlap&&tap.points.size===2&&event.timeStamp-tap.start<=350&&!drag?.undoRecorded){
  if(event.cancelable)event.preventDefault();
  lastObjectTap=null;
  restoreChange(undoStack,redoStack);
 }
},{passive:false});
diagramScroll.addEventListener('touchcancel',()=>{
 touchPan=null;touchTap=null;touchPlacement=null;
},{passive:true});
let printBounds=null;
window.addEventListener('beforeprint',()=>{
 if(printBounds)return;
 printBounds={bounds:canvasBounds,left:diagramScroll.scrollLeft,top:diagramScroll.scrollTop};
 updateCanvas(contentBounds(defaultCanvas),false);
});
window.addEventListener('afterprint',()=>{
 if(!printBounds)return;
 const {bounds,left,top}=printBounds;printBounds=null;
 updateCanvas(bounds,false);diagramScroll.scrollTo(left,top);
});
let zoom=100;
function setZoom(value,anchor){
 const next=clamp(value,50,400);
 if(next===zoom&&!anchor&&diagram.style.getPropertyValue('--diagram-zoom'))return;
 const viewport=diagramScroll.getBoundingClientRect();
 const x=anchor?.clientX??viewport.left+diagramScroll.clientWidth/2;
 const y=anchor?.clientY??viewport.top+diagramScroll.clientHeight/2;
 const before=diagram.getBoundingClientRect();
 zoom=next;
 sizeCanvas();
 el('zoom-reset').textContent=Math.round(zoom)+'%';
 el('zoom-out').disabled=zoom<=50;
 el('zoom-in').disabled=zoom>=400;
 const after=diagram.getBoundingClientRect();
 if(before.width&&before.height){
  diagramScroll.scrollLeft+=after.left+(x-before.left)*after.width/before.width-x;
  diagramScroll.scrollTop+=after.top+(y-before.top)*after.height/before.height-y;
 }
 drawControls();
}
let gestureZoom=null;
diagramScroll.addEventListener('wheel',event=>{
 if(!event.ctrlKey){extendAtEdge(event.deltaX,event.deltaY);return;}
 event.preventDefault();
 if(gestureZoom!==null)return;
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?diagramScroll.clientHeight:1);
 setZoom(zoom*Math.exp(-delta*.012),event);
},{passive:false});
diagramScroll.addEventListener('gesturestart',event=>{
 event.preventDefault();
 gestureZoom=zoom;
},{passive:false});
diagramScroll.addEventListener('gesturechange',event=>{
 if(gestureZoom===null)return;
 event.preventDefault();
 setZoom(gestureZoom*event.scale,event);
},{passive:false});
diagramScroll.addEventListener('gestureend',event=>{
 if(gestureZoom===null)return;
 event.preventDefault();
 gestureZoom=null;
},{passive:false});
el('zoom-out').onclick=()=>setZoom(zoom-25);
el('zoom-in').onclick=()=>setZoom(zoom+25);
el('zoom-reset').onclick=()=>setZoom(100);
new ResizeObserver(drawControls).observe(diagram);
el('toggle-grid').onclick=()=>{
 const show=el('toggle-grid').getAttribute('aria-pressed')!=='true';
 el('toggle-grid').setAttribute('aria-pressed',String(show));
 el('grid').style.display=show?'':'none';
};
el('plan-name').oninput=changed;
el('item-name').oninput=()=>{
 const item=selected();if(!item)return;
 item.name=el('item-name').value;
 changed();draw();
};
for(const [id,key,max,round] of [['item-angle','angle',359,Math.round],['item-height','height',30,n=>Math.round(n*10)/10]]){
 el(id).onchange=()=>{
  const item=selected();if(!item)return;
  item[key]=clamp(round(Number(el(id).value)||0),0,max);
  changed();draw();updateInspector();
 };
}
el('item-source').onchange=()=>{
 const item=selected();if(!item)return;
 item.source=el('item-source').value;
 changed();renderSchedule();
};
el('item-quantity').oninput=()=>{
 const item=selected(),field=el('item-quantity');
 if(!item||!field.checkValidity()||!Number.isInteger(field.valueAsNumber))return;
 item.quantity=field.valueAsNumber;
 changed();renderSchedule();
};
el('item-size').onchange=()=>{
 const item=selected(),field=el('item-size');
 if(!item||!field.checkValidity()||!Number.isInteger(field.valueAsNumber)){updateInspector();return;}
 item.size=field.valueAsNumber;
 changed();draw();
};
el('print-plan').onclick=()=>{
 el('print-title').textContent=el('plan-name').value.trim()||'舞台仕込み図';
 window.print();
};

async function importSvg(file){
 if(file.size>480000)throw new Error('SVGファイルは480 KB以下にしてください。');
 const source=await file.text();
 const inspect=source.replace(/<!DOCTYPE\s+svg\s+(?:PUBLIC|SYSTEM)\s+[^<\[>]+>/i,'');
 if(/<!DOCTYPE|<!ENTITY/i.test(inspect))throw new Error('このSVGの形式には対応していません。');
 const documentSvg=new DOMParser().parseFromString(inspect,'image/svg+xml');
 const root=documentSvg.documentElement;
 if(root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg'||documentSvg.querySelector('parsererror'))
  throw new Error('SVGファイルを選択してください。');
 const viewBox=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
 const w=viewBox?.length===4?viewBox[2]:parseFloat(root.getAttribute('width'));
 const h=viewBox?.length===4?viewBox[3]:parseFloat(root.getAttribute('height'));
 const ratio=w>0&&h>0?clamp(w/h,.02,50):1;
 const data=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=reject;
  reader.readAsDataURL(new Blob([source],{type:'image/svg+xml'}));
 });
 return {id:crypto.randomUUID(),name:file.name.replace(/\.svg$/i,'').slice(0,80)||'読み込んだオブジェクト',ratio,data};
}
const backgroundFile=el('svg-background-file');
el('import-background').onclick=()=>backgroundFile.click();
backgroundFile.onchange=async()=>{
 const file=backgroundFile.files[0];backgroundFile.value='';
 if(!file)return;
 const epoch=planEpoch;
 try{
  const asset=await importSvg(file);
  if(epoch!==planEpoch)return;
  const kept=assets.filter(entry=>entry.id!==background||items.some(item=>item.assetId===entry.id));
  if(kept.length>=60||kept.reduce((size,item)=>size+item.data.length,asset.data.length)>650000)
   throw new Error('図面に保存できるSVGの容量を超えました。');
  assets=[...kept,asset];background=asset.id;
  drawStage();changed();
 }catch(error){status(error.message||'SVGを読み込めませんでした。');}
};
el('remove-background').onclick=()=>{
 const old=background;
 background=null;
 assets=assets.filter(asset=>asset.id!==old||items.some(item=>item.assetId===old));
 drawStage();renderPalette();changed();
};

el('remove-item').onclick=()=>{
 if(locked(selected()))return;
 const removed=groupOf(selected());
 items=items.filter(item=>!removed.includes(item));
 marked.clear();
 selectedId=null;changed();draw();updateInspector();
};

const KEN_CM=181.8;
function rulerTicks(target,{origin,interval,left,right,width,baseline,direction,label}){
 if(right<=left||interval<=0)return;
 target.append(svg('line',{x1:left,y1:baseline,x2:right,y2:baseline,class:'ruler-tick'}));
 const labelEvery=Math.max(1,Math.ceil(43/interval));
 const subdivisions=interval>=40?4:interval>=14?2:1;
 for(let index=Math.ceil((left-origin)/interval*subdivisions);index<=(right-origin)/interval*subdivisions;index++){
  const value=index/subdivisions,x=origin+value*interval;
  const major=index%subdivisions===0&&value%labelEvery===0;
  target.append(svg('line',{x1:x,y1:baseline,x2:x,y2:baseline+direction*(major?7:4),class:'ruler-tick'}));
  if(major){
   const text=svg('text',{x:clamp(x,19,width-19),y:baseline+(direction<0?-11:20),class:'ruler-label'});
   text.textContent=label(value);target.append(text);
  }
 }
}
const meterLabel=value=>value+' m';
const kenLabel=value=>value===0?'0':Math.abs(value)+'間';
function drawRulers(frame){
 const rulers=el('diagram-rulers');
 rulers.replaceChildren();
 if(dimensions){
  for(const [origin,unit,y,baseline,direction,label] of [
   [frame.x,100,0,23,-1,meterLabel],
   [frame.x+frame.w/2,KEN_CM,625,626,1,kenLabel],
  ]){
   rulers.append(svg('rect',{x:0,y,width:1000,height:25,class:'ruler-strip'}));
   rulerTicks(rulers,{origin,interval:unit*frame.scale,left:12,right:988,width:1000,baseline,direction,label});
  }
 }
 scheduleViewportRulers();
}

let rulerFrame=0;
function scheduleViewportRulers(){
 if(rulerFrame)return;
 rulerFrame=requestAnimationFrame(()=>{
  rulerFrame=0;
  const diagramRect=diagram.getBoundingClientRect(),frame=geometry();
  const scale=diagramRect.width/canvasWidth();
  for(const [id,origin,unit,baseline,direction,label] of [
   ['meter-ruler',frame.x,100,23,-1,meterLabel],
   ['ken-ruler',frame.x+frame.w/2,KEN_CM,1,1,kenLabel],
  ]){
   const bar=el(id);
   bar.toggleAttribute('hidden',!dimensions);
   bar.replaceChildren();
   if(!dimensions||!scale)continue;
   const rect=bar.getBoundingClientRect(),width=Math.min(rect.width,diagramScroll.clientWidth);
   const offset=diagramRect.left-rect.left;
   rulerTicks(bar,{origin:offset+(origin-canvasBounds.left)*scale,interval:unit*frame.scale*scale,
    left:Math.max(0,offset),right:Math.min(width,offset+diagramRect.width),
    width,baseline,direction,label});
  }
 });
}
diagramScroll.addEventListener('scroll',()=>{scheduleViewportRulers();scheduleFloatingActions();},{passive:true});
const rulerObserver=new ResizeObserver(scheduleViewportRulers);
rulerObserver.observe(diagram);
rulerObserver.observe(diagramScroll);
function drawStage(){
 const image=el('diagram-background'),asset=assets.find(item=>item.id===background);
 image.toggleAttribute('hidden',!asset);
 diagram.classList.toggle('has-background',!!asset);
 el('remove-background').hidden=!asset;
 if(asset)image.setAttribute('href',asset.data);
 else image.removeAttribute('href');
 const template=stageTypes[stageType]||stageTypes.hall;
 const frame=geometry();
 const {x,y,w:width,h:height,scale}=frame;
 drawRulers(frame);
 const boundary=el('stage-boundary'),outline=el('stage-outline');
 boundary.toggleAttribute('hidden',!!venue);
 outline.toggleAttribute('hidden',!venue);
 outline.setAttribute('stroke-dasharray',stageType==='temporary'?'8 5':'none');
 const curtainLines=el('curtain-lines');
 curtainLines.replaceChildren();
 if(venue){
  outline.setAttribute('points',venue.outline.map(([x,y])=>{const p=positionSvg(x,y);return p.x+','+p.y;}).join(' '));
  for(const {name,start,end} of venue.curtains){
   const a=positionSvg(...start),b=positionSvg(...end);
   const path=svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'venue-curtain'});
   const label=svg('text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-8,class:'venue-curtain-label'});
   label.textContent=name;
   curtainLines.append(path,label);
  }
 }
 for(const [key,value] of Object.entries({x,y,width,height}))boundary.setAttribute(key,value);
 boundary.setAttribute('stroke-dasharray',stageType==='temporary'?'8 5':'none');
 el('stage-rear').setAttribute('y',y+35);
 el('stage-front').setAttribute('y',y+height-20);
 el('stage-type-label').textContent=stageType?template.label:'';
 const fallback=defaultDimensions[stageType]||defaultDimensions.hall;
 el('stage-width').value=dimensions?.width??fallback[0];
 el('stage-depth').value=dimensions?.depth??fallback[1];
 const lines=el('dimension-lines');lines.replaceChildren();
 if(!dimensions)return;
 const line=(x1,y1,x2,y2)=>lines.append(svg('line',{x1,y1,x2,y2,stroke:'#34465b','stroke-width':2}));
 const label=(x,y,text)=>{const node=svg('text',{x,y,class:'diagram-label'});node.textContent=text;lines.append(node);};
 line(x,55,x+width,55);line(x,48,x,62);line(x+width,48,x+width,62);
 label(x+width/2,43,dimensions.width+' cm');
 line(x+width+21,y,x+width+21,y+height);
 line(x+width+14,y,x+width+28,y);line(x+width+14,y+height,x+width+28,y+height);
 label(x+width+75,y+height/2,dimensions.depth+' cm');
 line(42,589,42+100*scale,589);line(42,583,42,595);line(42+100*scale,583,42+100*scale,595);
 label(42+50*scale,612,'100 cm');

}
for(const field of ['x','y']){
 el('item-'+field).onchange=()=>{
  const item=selected(),value=el('item-'+field).valueAsNumber;
  if(!item||!dimensions||!Number.isFinite(value)){updateInspector();return;}
  const cm=positionCm(item);cm[field]=Math.round(value);
  const pos=positionSvg(cm.x,cm.y);
  if(!inWorld(pos)){updateInspector();status('図面の範囲内の座標を入力してください。');return;}
  Object.assign(item,pos);changed();draw();updateInspector();
 };
}
el('stage-dimensions').onsubmit=event=>{
 event.preventDefault();
 const next={width:el('stage-width').valueAsNumber,depth:el('stage-depth').valueAsNumber};
 if(!event.currentTarget.checkValidity())return;
 const old=dimensions,original=geometry();
 dimensions=next;
 if(old){
  const moved=items.map(item=>{const cm=positionCm(item,original);return {...item,...positionSvg(cm.x,cm.y)};});
  if(moved.some(item=>!inWorld(item))){
   dimensions=old;status('寸法変更後に図面外に出る機材があります。配置を見直してください。');return;
  }
  items=moved;
  if(venue)venue={...venue,outline:venue.outline.map(([x,y])=>[Math.round(x*next.width/old.width),Math.round(y*next.depth/old.depth)])};
 }
 drawStage();draw();updateInspector();changed();
};
const venueDialog=el('venue-dialog');
function outlinePreset(kind){
 const {width:w,depth:d}=dimensions;
 const inset=Math.round(w/5),halfW=Math.round(w/2),halfD=Math.round(d/2);
 if(kind==='trapezoid')return [[inset,0],[w-inset,0],[w,d],[0,d]];
 if(kind==='l')return [[0,0],[w,0],[w,halfD],[halfW,halfD],[halfW,d],[0,d]];
 return [[0,0],[w,0],[w,d],[0,d]];
}
function writeOutline(points){el('venue-outline').value=points.map(p=>p.join(', ')).join('\n');}
el('edit-venue').onclick=()=>{
 if(!dimensions){status('先にステージ寸法を適用してください。');el('stage-width').focus();return;}
 writeOutline(venue?.outline||outlinePreset('rectangle'));
 el('venue-curtains').value=(venue?.curtains||[]).map(c=>[c.name,...c.start,...c.end].join(', ')).join('\n');
 el('venue-status').textContent='';
 venueDialog.showModal();
};
el('close-venue').onclick=()=>venueDialog.close();
for(const button of venueDialog.querySelectorAll('[data-outline]'))button.onclick=()=>writeOutline(outlinePreset(button.dataset.outline));
el('curtain-preset').onclick=()=>{
 const {width:w,depth:d}=dimensions;
 const left=Math.round(w/10),right=w-left,back=Math.round(d/10),front=Math.round(d*0.8);
 el('venue-curtains').value=[['左袖幕',left,back,left,front],['右袖幕',right,back,right,front],['奥幕',left,back,right,back]].map(row=>row.join(', ')).join('\n');
};
function rows(id){
 return el(id).value.trim().split(/\r?\n/).filter(row=>row.trim()).map(row=>row.split(/[,，]/).map(cell=>cell.trim()));
}
function integer(value){return /^-?\d+$/.test(value)?Number(value):NaN;}
el('venue-form').onsubmit=event=>{
 event.preventDefault();
 const outline=rows('venue-outline').map(row=>row.map(integer));
 const {width:w,depth:d}=dimensions;
 const area=outline.reduce((sum,[x,y],i)=>{const [nx,ny]=outline[(i+1)%outline.length];return sum+x*ny-nx*y;},0);
 if(outline.length<3||outline.length>32||outline.some(p=>p.length!==2||!Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<0||p[0]>w||p[1]<0||p[1]>d)||!area){
  el('venue-status').textContent='外周は舞台寸法内の異なる3〜32点を、外周に沿って入力してください。';return;
 }
 const curtains=rows('venue-curtains').map(([name,...values])=>({name,coords:values.map(integer)}));
 if(curtains.length>32||curtains.some(c=>!c.name||c.name.length>40||c.coords.length!==4||c.coords.some(n=>!Number.isInteger(n)||Math.abs(n)>20000)||(c.coords[0]===c.coords[2]&&c.coords[1]===c.coords[3]))){
  el('venue-status').textContent='幕は名前と異なる始点・終点の座標を入力してください（32本まで）。';return;
 }
 venue={outline,curtains:curtains.map(({name,coords})=>({name,start:coords.slice(0,2),end:coords.slice(2)}))};
 venueDialog.close();drawStage();changed();
};
function placementLayer(){
 return (layers.find(layer=>layer.id===activeLayer&&layer.visible)||layers.find(layer=>layer.visible)||layers[0]).id;
}
function layerSelection(){
 return marked.size?items.filter(item=>marked.has(item.id)):groupOf(selected());
}
function refreshLayers(){
 changed();draw();updateInspector();
}
function layerButton(label,action){
 const button=document.createElement('button');
 button.type='button';button.textContent=label;button.onclick=action;
 return button;
}
function renderLayers(){
 const list=el('layer-list'),objects=el('layer-objects'),move=el('move-layer');
 if(!layers.some(layer=>layer.id===activeLayer))activeLayer=layers[0].id;
 list.replaceChildren();objects.replaceChildren();move.replaceChildren(new Option('選択してください',''));
 const selection=layerSelection();
 el('group-items').disabled=selection.length<2;
 el('ungroup-items').disabled=!selection.some(item=>item.groupId);
 move.disabled=!selection.length;
 for(const layer of [...layers].reverse()){
  const row=document.createElement('div');
  row.className='layer-row';
  const select=layerButton(layer.name,()=>{activeLayer=layer.id;renderLayers();});
  select.setAttribute('aria-pressed',String(activeLayer===layer.id));
  const toggle=layerButton(layer.visible?'表示':'非表示',()=>{
   if(layer.visible&&layers.filter(entry=>entry.visible).length===1)return;
   layers=layers.map(entry=>entry===layer?{...layer,visible:!layer.visible}:entry);
   if(selected()&&!visible(selected()))selectedId=null;
   refreshLayers();
  });
  const reorder=direction=>{
   const index=layers.indexOf(layer),next=index+direction;
   const order=[...layers];
   [order[index],order[next]]=[order[next],order[index]];
   layers=order;refreshLayers();
  };
  const up=layerButton('↑',()=>reorder(1)),down=layerButton('↓',()=>reorder(-1));
  up.setAttribute('aria-label',layer.name+'を前面へ');down.setAttribute('aria-label',layer.name+'を背面へ');
  up.disabled=layers.at(-1)===layer;down.disabled=layers[0]===layer;
  row.append(select,toggle,up,down);list.append(row);
  move.append(new Option(layer.name,layer.id));
 }
 for(const item of orderedItems().reverse()){
  const label=document.createElement('label'),checkbox=document.createElement('input');
  checkbox.type='checkbox';checkbox.checked=selection.includes(item);
  checkbox.onchange=()=>{
   if(!marked.size)for(const entry of selection)marked.add(entry.id);
   if(checkbox.checked)marked.add(item.id);else marked.delete(item.id);
   selectedId=null;draw();updateInspector();
  };
  label.append(checkbox,(item.name||toolFor(item.assetId||item.kind).label)+(item.groupId?' · グループ':'')+' / '+layers.find(layer=>layer.id===layerOf(item)).name);
  objects.append(label);
 }
}
el('add-layer').onsubmit=event=>{
 event.preventDefault();
 const input=el('layer-name'),name=input.value.trim();
 if(!name||layers.length>=20)return;
 activeLayer=crypto.randomUUID();
 layers=[...layers,{id:activeLayer,name,visible:true}];input.value='';refreshLayers();
};
el('move-layer').onchange=event=>{
 const id=event.target.value;
 if(!id)return;
 for(const item of new Set(layerSelection().flatMap(groupOf)))if(!locked(item))item.layerId=id;
 if(selected()&&!visible(selected()))selectedId=null;
 refreshLayers();
};
el('group-items').onclick=()=>{
 const members=[...new Set(layerSelection().flatMap(groupOf))];
 if(members.length<2||members.some(locked))return;
 const groupId=crypto.randomUUID();
 for(const item of members)item.groupId=groupId;
 marked.clear();selectedId=members.find(visible)?.id??null;refreshLayers();
};
el('ungroup-items').onclick=()=>{
 for(const item of layerSelection().flatMap(groupOf))if(!locked(item))delete item.groupId;
 marked.clear();refreshLayers();
};

function duplicateSelected(){
 const multiple=marked.size>1;
 const members=[...new Set(layerSelection().flatMap(groupOf))];
 if(!members.length||members.some(locked))return;
 if(items.length+members.length>200){status('図面に配置できる項目は200件までです。');return;}
 const offset=dimensions?20*geometry().scale:12;
 const dx=Math.min(offset,...members.map(item=>WORLD_LIMIT-item.x));
 const dy=Math.min(offset,...members.map(item=>WORLD_LIMIT-item.y));
 const groups=new Map();
 const copies=members.map(item=>{
  const copy={...item,id:crypto.randomUUID(),x:item.x+dx,y:item.y+dy};
  if(item.groupId){
   if(!groups.has(item.groupId))groups.set(item.groupId,crypto.randomUUID());
   copy.groupId=groups.get(item.groupId);
  }
  return copy;
 });
 const copy=copies[0];
 items.push(...copies);marked.clear();
 selectedId=multiple?null:copy.id;
 if(multiple)for(const item of copies)marked.add(item.id);
 changed();draw();updateInspector();
 equipment.querySelector('[data-item="'+copy.id+'"]')?.focus({preventScroll:true});
}

const objectMenu=el('object-menu');
let menuAnchor=null;
function closeObjectMenu(restoreFocus=false){
 if(objectMenu.hidden)return;
 objectMenu.hidden=true;
 if(restoreFocus&&menuAnchor?.isConnected)menuAnchor.focus({preventScroll:true});
 menuAnchor=null;
}
function showObjectMenu(x,y,anchor){
 menuAnchor=anchor;
 for(const button of objectMenu.querySelectorAll('[data-action]'))
  button.hidden=button.dataset.action==='reset'?!!selected():!selected()||locked(selected());
 if(selected()&&locked(selected()))return;
 objectMenu.hidden=false;
 const width=objectMenu.offsetWidth,height=objectMenu.offsetHeight;
 objectMenu.style.left=Math.max(8,Math.min(x,innerWidth-width-8))+'px';
 objectMenu.style.top=Math.max(8,Math.min(y,innerHeight-height-8))+'px';
 objectMenu.querySelector('button:not([hidden])')?.focus({preventScroll:true});
}
diagram.addEventListener('contextmenu',event=>{
 event.preventDefault();
 if(placing)setPlacement(null);
 const target=event.target.closest('[data-item]');
 selectedId=target?.dataset.item??(event.target.closest('[data-grip]')?selectedId:null);
 for(const node of equipment.children)node.setAttribute('aria-pressed',String(groupOf(selected()).some(item=>item.id===node.dataset.item)));
 drawControls();updateInspector();
 const box=target?.getBoundingClientRect();
 showObjectMenu(event.clientX||box?.left||16,event.clientY||box?.bottom||16,target);
});
diagram.addEventListener('keydown',event=>{
 if(!(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'))return;
 const target=event.target.closest('[data-item]');
 if(!target)return;
 event.preventDefault();
 selectedId=target.dataset.item;
 drawControls();updateInspector();
 const box=target.getBoundingClientRect();
 showObjectMenu(box.left,box.bottom,target);
});
el('open-item-menu').onclick=()=>{
 const button=el('open-item-menu'),box=button.getBoundingClientRect();
 showObjectMenu(box.left,box.bottom,button);
};
objectMenu.addEventListener('click',event=>{
 const action=event.target.closest('button')?.dataset.action;
 if(!action)return;
 closeObjectMenu(true);
 if(action==='reset'){setZoom(100);return;}
 const item=selected();
 if(!item||locked(item))return;
 if(action==='properties')editSelected();else if(action==='duplicate')duplicateSelected();
 else if(action==='delete')el('remove-item').click();
 else{
  if(action==='rotate')item.angle=(item.angle+90)%360;
  else{
   const rest=items.filter(entry=>entry.id!==item.id);
   items=action==='front'?[...rest,item]:[item,...rest];
  }
  changed();draw();updateInspector();
  equipment.querySelector('[data-item="'+item.id+'"]')?.focus({preventScroll:true});
 }
});
objectMenu.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeObjectMenu(true);return;}
 if(event.key==='Tab'){closeObjectMenu(true);return;}
 const buttons=[...objectMenu.querySelectorAll('button:not([hidden])')];
 const index=buttons.indexOf(document.activeElement);
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 event.preventDefault();
 const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
 buttons[next]?.focus();
});
document.addEventListener('pointerdown',event=>{if(!objectMenu.contains(event.target))closeObjectMenu();});
window.addEventListener('resize',()=>closeObjectMenu());
window.addEventListener('scroll',()=>closeObjectMenu(),true);

let activeToolPanel='materials';
function showToolPanel(panel){
 activeToolPanel=panel;
 for(const content of document.querySelectorAll('[data-tool-panel]'))content.hidden=content.dataset.toolPanel!==panel;
 for(const button of document.querySelectorAll('.tool-rail [data-panel]'))button.setAttribute('aria-pressed',String(button.dataset.panel===panel));
 document.querySelector('.plan-layout').classList.toggle('tools-collapsed',!panel);
}
for(const button of document.querySelectorAll('.tool-rail [data-panel]')){
 button.onclick=()=>showToolPanel(activeToolPanel===button.dataset.panel?null:button.dataset.panel);
}
el('rail-plans').onclick=()=>el('open-list').click();
for(const [id,kind] of [['add-text','annotation-text'],['add-line','annotation-line']]){
 const button=el(id);
 bindPaletteDrag(button,button,kind,toolFor(kind).label);
}

function loadPlan(plan){
 closeObjectMenu();
 planEpoch++;
 updateCanvas(defaultCanvas,false);
 setZoom(100);
 diagramScroll.scrollTo(0,0);
 dimensions=plan.dimensions??null;
 assets=plan.assets??[];background=plan.background??null;
 renderPalette();
 venue=plan.venue??null;
 stageType=Object.hasOwn(stageTypes,plan.stageType)?plan.stageType:null;
 el('plan-welcome').hidden=true;el('plan-editor').hidden=false;
 drawStage();
 id=plan.id??null;version=plan.version??null;
 rememberPlan();
 layers=plan.layers??[baseLayer];activeLayer=layers[0].id;marked.clear();
 items=plan.items;el('plan-name').value=plan.title;
 clearTimeout(saveTimer);
 selectedId=null;setPlacement(null);dirty=false;
 savedPlan=id?JSON.stringify(planPayload()):null;
 previous=snapshot();undoStack=[];redoStack=[];
 draw();updateInspector();
 status(id?'保存した図面を開きました。':'新しい図面です。');
}
async function canReplace(){
 if(opening)return false;
 clearTimeout(saveTimer);
 if(saving)await saving;
 if(dirty)await savePlan();
 return !dirty||confirm('保存できていない変更があります。破棄しますか？');
}
const typePicker=el('stage-type-picker');
for(const [key,template] of Object.entries(stageTypes)){
 const button=document.createElement('button'),name=document.createElement('strong'),description=document.createElement('small');
 button.type='button';name.textContent=template.label;description.textContent=template.description;
 button.append(name,description);
 button.onclick=()=>{
  typePicker.close();
  loadPlan({title:template.label+'の図面',stageType:key,dimensions:{width:defaultDimensions[key][0],depth:defaultDimensions[key][1]},items:[]});
  changed();
 };
 el('stage-types').append(button);
}
el('new-plan').onclick=async()=>{if(await canReplace()&&!typePicker.open)typePicker.showModal();};
el('welcome-new').onclick=()=>typePicker.showModal();
el('close-stage-types').onclick=()=>typePicker.close();
function savePlan(manual=false){
 clearTimeout(saveTimer);
 if(saving)return saving;
 if(opening||!dirty||!hasUnsavedChanges())return Promise.resolve();
 const title=el('plan-name').value.trim();
 if(!title){
  status('図面名を入力すると自動保存します。');
  if(manual)el('plan-name').focus();
  return Promise.resolve();
 }
 const plan=planPayload(),serialized=JSON.stringify(plan);
 el('save-plan').disabled=true;
 status('サーバーに保存しています…');
 saving=(async()=>{
  let succeeded=false;
  try{
   const result=await api('/stage/plans'+(id?'/'+id:''),{plan,version});
   id=result.id;version=result.version;
   rememberPlan();
   savedPlan=serialized;
   dirty=hasUnsavedChanges();
   succeeded=true;
   status(dirty?'変更を自動保存します…':'サーバーに保存しました。');
  }catch(error){
   status(error.message||'保存できませんでした。「今すぐ保存」で再試行できます。');
  }finally{
   saving=null;
   el('save-plan').disabled=false;
   if(succeeded&&dirty)scheduleSave();
  }
 })();
 return saving;
}
el('save-plan').onclick=()=>savePlan(true);
window.addEventListener('online',scheduleSave);
el('open-list').onclick=async()=>{
 if(saving||opening)return;
 const picker=el('plan-picker'),list=el('plan-list'),message=el('list-status');
 list.replaceChildren();
 message.textContent='読み込んでいます…';
 picker.showModal();
 try{
  const {plans}=await api('/stage/plans');
  message.textContent=plans.length?'':'保存した図面はありません。';
  for(const plan of plans){
   const li=document.createElement('li'),button=document.createElement('button'),time=document.createElement('small');
   button.type='button';
   time.textContent=new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(plan.updatedAt);
   button.append(document.createTextNode(plan.title+(stageTypes[plan.stageType]?' · '+stageTypes[plan.stageType].label:'')),time);
   button.onclick=async()=>{
    if(!await canReplace())return;
    opening=true;
    message.textContent='図面を開いています…';
    try{loadPlan(await api('/stage/plans/'+plan.id));picker.close();}
    catch(error){message.textContent=error.message;}
    finally{opening=false;}
   };
   li.append(button);list.append(li);
  }
 }catch(error){message.textContent=error.message;}
};
el('welcome-open').onclick=()=>el('open-list').click();
el('close-list').onclick=()=>el('plan-picker').close();
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
setupSession(async profile=>{
 lastPlanKey=profile?.id?'stage-plan-last:'+profile.id:null;
 recentObjectsKey=profile?.id?'stage-plan-recent-objects:'+profile.id:null;
 recentObjects=[];
 if(recentObjectsKey)try{
  const history=JSON.parse(localStorage.getItem(recentObjectsKey)||'[]');
  if(Array.isArray(history))recentObjects=[...new Set(history.filter(kind=>typeof kind==='string'))].slice(0,recentLimit);
 }catch{}
 let last=null;
 try{if(lastPlanKey)last=localStorage.getItem(lastPlanKey);}catch{}
 const resume=/^[A-Za-z0-9]{20}$/.test(last||'');
 const loading=el('plan-loading'),welcome=el('plan-welcome');
 welcome.hidden=true;
 loading.textContent=resume?'前回の図面を読み込んでいます…':'図面を開く準備をしています…';
 loading.hidden=false;
 el('workspace').hidden=false;
 try{
  await loadCatalog();
  if(resume){
   try{loadPlan(await api('/stage/plans/'+last));return;}
   catch(error){
    if(error.status===404)try{localStorage.removeItem(lastPlanKey);}catch{}
   }
  }
  welcome.hidden=false;
  typePicker.showModal();
 }catch{
  loading.textContent='機材一覧を読み込めませんでした。ページを再読み込みしてください。';
 }finally{
  if(!el('plan-editor').hidden||!welcome.hidden)loading.hidden=true;
 }
},()=>dirty);
