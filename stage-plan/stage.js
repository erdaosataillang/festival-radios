import {api,setupSession} from './session.js?v=source-svg-zoom-1';
import {equipmentShape} from './equipment-symbols.js?v=2';

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

const quickTools=['speaker','monitor','sub','light','truss'];
const colors={speakers:'#255a88',instruments:'#326f64',audio:'#47456a',lighting:'#99610e',stage:'#5b6472'};
const tools=Object.create(null);
const sourceImages=new Map();
const annotationTools={
 'annotation-line':{label:'線',color:'#192326'},
 'annotation-text':{label:'テキスト',color:'#192326'},
};
const isAnnotation=item=>Object.hasOwn(annotationTools,item.kind);
let lineDraft=null;
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
 const response=await fetch(new URL('./catalog.json?v=2',import.meta.url));
 if(!response.ok)throw new Error('機材一覧を読み込めませんでした。');
 for(const {id,label,group,symbol,mark} of await response.json())
  tools[id]={label,group,color:colors[group],shape:equipmentShape(symbol,mark)};
 const {symbols}=await api('/stage/source-catalog');
 const categories=document.createElement('optgroup');categories.label='舞台仕込み図オープンテンプレート';
 categories.append(new Option('配布オブジェクト：すべて','source'));
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
let dirty=false,saving=null,opening=false,saveTimer;
let previous,undoStack=[],redoStack=[];
const snapshot=()=>({title:el('plan-name').value,items:items.map(item=>({...item})),selectedId,dimensions,venue,assets,background});
function scheduleSave(){
 clearTimeout(saveTimer);
 if(dirty&&!saving&&!opening&&!drag)saveTimer=setTimeout(()=>savePlan(),850);
}
const selected=()=>items.find(item=>item.id===selectedId);
function changed(){
 if(previous&&(!drag||!drag.undoRecorded)){
  undoStack.push(previous);
  if(undoStack.length>60)undoStack.shift();
  redoStack=[];
  if(drag)drag.undoRecorded=true;
 }
 previous=snapshot();
 el('undo-edit').disabled=!undoStack.length;
 el('redo-edit').disabled=!redoStack.length;
 dirty=true;
 status('変更を自動保存します…');
 scheduleSave();
}
function restoreChange(from,to){
 if(!from.length)return;
 const focused=diagram.contains(document.activeElement);
 to.push(snapshot());
 const state=from.pop();
 dimensions=state.dimensions;venue=state.venue;assets=state.assets;background=state.background;setPlacement(null);renderPalette();drawStage();items=state.items;selectedId=state.selectedId;el('plan-name').value=state.title;
 previous=snapshot();
 dirty=true;draw();updateInspector();scheduleSave();
 status('変更を自動保存します…');
 if(focused&&selectedId)equipment.querySelector('[data-item="'+selectedId+'"]')?.focus({preventScroll:true});
}

function svg(tag,attrs){
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
 return node;
}

function setPlacement(kind){
 placing=kind;
 diagram.classList.toggle('placing',!!kind);
 for(const button of el('palette').querySelectorAll('button'))
  button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
 el('placement-help').textContent=kind==='annotation-line'?'図面上で線の始点から終点までドラッグしてください。':kind?toolFor(kind).label+'を置く位置をクリックまたはタップしてください。':'機材を選び、図面をクリックまたはタップして配置します。';
}

function updateInspector(){
 const item=selected();
 el('empty-selection').hidden=!!item;
 el('item-fields').hidden=!item;
 if(!item)return;
 el('item-name').value=item.name;
 el('item-name-label').textContent=item.kind==='annotation-text'?'テキスト':'機材名';
 el('item-name').hidden=el('item-name-label').hidden=item.kind==='annotation-line';
 el('item-size-label').textContent=item.kind==='annotation-line'?'線の長さ（cm）':'幅（cm）';
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
function symbolDimensions(item){
 const tool=toolFor(item.assetId||item.kind),image=tool.asset||tool.source;
 const unit=dimensions?geometry().scale:1;
 const width=item.size!=null?item.size*unit:image?(dimensions?(tool.source?.size??60)*unit:48):90;
 return {width,height:width/(image?.ratio??(item.kind==='annotation-line'?9:item.kind==='annotation-text'?3:(90/80)))};
}
function poseItem(group,item){
 const {width,height}=symbolDimensions(item);
 group.setAttribute('transform',`translate(${item.x} ${item.y})`);
 const body=group.querySelector('.object-body');
 body.setAttribute('transform',`rotate(${item.angle}) scale(${width/90})`);
 const label=group.querySelector('.object-name');
 label.setAttribute('y',Math.max(20,height/2)+16);
}
function drawControls(){
 objectControls.replaceChildren();
 const item=selected();
 el('object-actions').hidden=!item;
 el('canvas-hint').hidden=!!item;
 el('undo-edit').disabled=!undoStack.length;
 el('redo-edit').disabled=!redoStack.length;
 if(!item)return;
 el('selected-object-name').textContent=item.name||toolFor(item.assetId||item.kind).label;
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
 for(const [corner,cx,cy] of [['nw',-gripX,-gripY],['ne',gripX,-gripY],['sw',-gripX,gripY],['se',gripX,gripY],['rotate',0,gripY+offset]]){
  controls.append(svg('circle',{cx,cy,r:target,class:'object-grip-target','data-grip':corner}));
  controls.append(svg('circle',{cx,cy,r:grip,class:'object-grip'}));
 }
 objectControls.append(controls);
}
function draw(){
 equipment.replaceChildren();
 for(const item of items){
  const tool=toolFor(item.assetId||item.kind);
  const group=svg('g',{tabindex:0,role:'button','aria-label':item.name||tool.label,
   'aria-pressed':String(item.id===selectedId),class:'equipment-item','data-item':item.id});
  const body=svg('g',{class:'object-body',fill:tool.color,color:tool.color});
  const imported=tool.asset||tool.source;
  const height=imported?90/imported.ratio:item.kind==='annotation-line'?10:item.kind==='annotation-text'?30:80;
  body.append(svg('rect',{x:-45,y:-height/2,width:90,height,fill:'transparent'}));
  const symbol=svg('g',{});
  if(imported){
   const image=svg('image',{x:-45,y:-height/2,width:90,height});
   symbol.append(image);
   if(tool.asset)image.setAttribute('href',tool.asset.data);
   else loadSourceImage(item.kind).then(data=>image.setAttribute('href',data)).catch(()=>{if(image.isConnected)status('オブジェクトを読み込めませんでした。図面を開き直してください。');});
  }else if(item.kind==='annotation-line'){
   symbol.append(svg('line',{x1:-45,y1:0,x2:45,y2:0,stroke:tool.color,'stroke-width':2,'vector-effect':'non-scaling-stroke'}));
  }else if(item.kind==='annotation-text'){
   symbol.append(svg('rect',{x:-45,y:-15,width:90,height:30,fill:'#fff','fill-opacity':.9,rx:2}));
   const text=svg('text',{x:0,y:0,class:'annotation-text'});
   const lines=item.name.split('\n').slice(0,4);
   lines.forEach((line,index)=>{
    const span=svg('tspan',{x:0,y:(index-(lines.length-1)/2)*7+2.5});
    if(line.length>17){span.setAttribute('textLength','84');span.setAttribute('lengthAdjust','spacingAndGlyphs');}
    span.textContent=line;text.append(span);
   });
   symbol.append(text);
  }else symbol.innerHTML=tool.shape;
  const label=svg('text',{class:'object-name','pointer-events':'none'});
  label.textContent=isAnnotation(item)?'':item.name||tool.label;
  body.append(symbol);group.append(body,label);equipment.append(group);
  poseItem(group,item);
 }
 drawControls();
 renderSchedule();
}

function point(event,limit=true){
 const pos=new DOMPoint(event.clientX,event.clientY).matrixTransform(diagram.getScreenCTM().inverse());
 return limit?{x:Math.round(clamp(pos.x,0,1000)),y:Math.round(clamp(pos.y,0,650))}:{x:pos.x,y:pos.y};
}
function rotateVector(x,y,angle){
 const r=angle*Math.PI/180;
 return {x:x*Math.cos(r)-y*Math.sin(r),y:x*Math.sin(r)+y*Math.cos(r)};
}

function snapPosition(pos){
 if(!dimensions)return pos;
 const frame=geometry(),cm=positionCm(pos,frame);
 const snapped=positionSvg(cm.x,cm.y,frame);
 return {x:clamp(snapped.x,0,1000),y:clamp(snapped.y,0,650)};
}
function addItem(position){
 if(items.length>=200){status('1つの図面に配置できる機材は200件までです。');return;}
 const tool=toolFor(placing);
 const item={id:crypto.randomUUID(),kind:tool.asset?'imported-svg':placing,...(tool.asset?{assetId:tool.asset.id,size:60}:tool.source?{size:tool.source.size}:placing==='annotation-text'?{size:250}:{}),name:tool.label,...snapPosition(position),angle:0,height:0};
 items.push(item);
 selectedId=item.id;
 setPlacement(null);
 changed();draw();updateInspector();
 if(item.kind==='annotation-text'){showToolPanel('properties');el('item-name').focus();el('item-name').select();}
}

function renderPalette(){
 const palette=el('palette'),category=el('equipment-category').value;
 const query=el('equipment-search').value.trim().normalize('NFKC').toLowerCase();
 const matches=[...Object.entries(tools),...assets.filter(asset=>asset.id!==background).map(asset=>[asset.id,toolFor(asset.id)])].filter(([kind,tool])=>{
  const inCategory=category==='all'||tool.group===category||(category==='source'&&!!tool.source);
  if(query)return (category==='quick'||inCategory)&&
   (tool.label.normalize('NFKC').toLowerCase().includes(query)||kind.includes(query));
  return inCategory||(category==='quick'&&quickTools.includes(kind));
 });
 palette.replaceChildren();
 el('equipment-count').textContent=matches.length+'件';
 for(const [kind,tool] of matches){
  const button=document.createElement('button');
  button.type='button';button.dataset.kind=kind;
  button.setAttribute('aria-pressed',String(kind===placing));
  const icon=svg('svg',{viewBox:'-45 -40 90 80',fill:tool.color,color:tool.color,'aria-hidden':'true'});
  if(tool.asset)icon.append(svg('image',{href:tool.asset.data,x:-36,y:-36,width:72,height:72}));
  else if(tool.source)icon.append(svg('rect',{x:-24,y:-24,width:48,height:48,fill:'none',stroke:'currentColor','stroke-width':5}));
  else icon.innerHTML=tool.shape;
  button.append(icon,document.createTextNode(tool.label));
  button.onclick=()=>setPlacement(placing===kind?null:kind);
  palette.append(button);
 }
}
el('equipment-category').onchange=renderPalette;
el('equipment-search').oninput=renderPalette;

diagram.addEventListener('pointerdown',event=>{
 if(event.button!==0||drag||lineDraft||spaceDown)return;
 if(placing==='annotation-line'){
  event.preventDefault();
  const start=point(event);
  const preview=svg('line',{x1:start.x,y1:start.y,x2:start.x,y2:start.y,stroke:'#7c3aed','stroke-width':2,'vector-effect':'non-scaling-stroke'});
  el('line-draft').append(preview);
  lineDraft={pointer:event.pointerId,start,preview,end:start};
  diagram.setPointerCapture(event.pointerId);
  return;
 }
 const grip=event.target.closest('[data-grip]')?.dataset.grip;
 if(grip&&selected()){
  event.preventDefault();
  const item=selected(),{width,height}=symbolDimensions(item);
  drag={pointer:event.pointerId,item,grip,width,height,x:item.x,y:item.y,angle:item.angle,start:point(event,false)};
  diagram.setPointerCapture(event.pointerId);
  return;
 }
 if(placing){event.preventDefault();addItem(point(event));return;}
 const target=event.target.closest('[data-item]');
 if(!target){selectedId=null;drawControls();updateInspector();return;}
 selectedId=target.dataset.item;
 const item=selected(),start=point(event);
 drag={pointer:event.pointerId,item,start,x:item.x,y:item.y};
 diagram.setPointerCapture(event.pointerId);
 target.focus({preventScroll:true});
 for(const node of equipment.children)node.setAttribute('aria-pressed',String(node.dataset.item===selectedId));
 drawControls();updateInspector();
});
diagram.addEventListener('pointermove',event=>{
 if(lineDraft&&event.pointerId===lineDraft.pointer){
  let end=point(event);
  if(event.shiftKey){
   const {start}=lineDraft,dx=end.x-start.x,dy=end.y-start.y;
   const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4),length=Math.hypot(dx,dy);
   end={x:clamp(start.x+length*Math.cos(angle),0,1000),y:clamp(start.y+length*Math.sin(angle),0,650)};
  }
  lineDraft.end=end;
  lineDraft.preview.setAttribute('x2',end.x);lineDraft.preview.setAttribute('y2',end.y);
  return;
 }
 if(!drag||event.pointerId!==drag.pointer)return;
 const item=drag.item;
 const before=[item.x,item.y,item.angle,item.size].join(',');
 const end=point(event,!drag.grip);
 if(drag.grip==='rotate'){
  const angle=Math.atan2(end.y-item.y,end.x-item.x)*180/Math.PI-90;
  const step=event.shiftKey?15:1;
  item.angle=(Math.round(angle/step)*step+360)%360;
 }else if(drag.grip){
  const sx=drag.grip.endsWith('e')?1:-1,sy=drag.grip.startsWith('s')?1:-1;
  const vector=rotateVector(sx*drag.width,sy*drag.height,drag.angle);
  const anchor={x:drag.x-vector.x/2,y:drag.y-vector.y/2};
  const factor=1+((end.x-drag.start.x)*vector.x+(end.y-drag.start.y)*vector.y)/(vector.x**2+vector.y**2);
  const unit=dimensions?geometry().scale:1;
  const size=clamp(Math.round(drag.width*factor/unit),1,20000);
  const ratio=size*unit/drag.width;
  const x=anchor.x+vector.x*ratio/2,y=anchor.y+vector.y*ratio/2;
  if(x>=0&&x<=1000&&y>=0&&y<=650)Object.assign(item,{size,x,y});
 }else{
  Object.assign(item,snapPosition({x:clamp(drag.x+end.x-drag.start.x,0,1000),y:clamp(drag.y+end.y-drag.start.y,0,650)}));
 }
 if(before===[item.x,item.y,item.angle,item.size].join(','))return;
 poseItem(equipment.querySelector('[data-item="'+item.id+'"]'),item);
 drawControls();
 changed();
});
diagram.addEventListener('pointerup',event=>{
 if(!lineDraft||lineDraft.pointer!==event.pointerId)return;
 const {start,end}=lineDraft;
 const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
 if(length<2)return;
 if(items.length>=200){status('図面に配置できる項目は200件までです。');return;}
 const item={id:crypto.randomUUID(),kind:'annotation-line',name:'線',x:(start.x+end.x)/2,y:(start.y+end.y)/2,
  angle:(Math.round(Math.atan2(dy,dx)*180/Math.PI)+360)%360,height:0,
  size:clamp(Math.round(length/(dimensions?geometry().scale:1)),1,20000)};
 items.push(item);selectedId=item.id;setPlacement(null);changed();draw();updateInspector();
});
diagram.addEventListener('lostpointercapture',()=>{
 if(lineDraft){lineDraft.preview.remove();lineDraft=null;}
 drag=null;updateInspector();scheduleSave();
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
 if(direction){
  const step=dimensions?(event.shiftKey?10:1)*geometry().scale:(event.shiftKey?25:5);
  item.x=clamp(item.x+step*direction[0],0,1000);
  item.y=clamp(item.y+step*direction[1],0,650);
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
 if(command&&!event.altKey&&key==='d'&&selected()){
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
  if(/^[1-5]$/.test(key)){
   event.preventDefault();setPlacement(quickTools[Number(key)-1]);
  }
 }
});
el('undo-edit').onclick=()=>restoreChange(undoStack,redoStack);
el('redo-edit').onclick=()=>restoreChange(redoStack,undoStack);
el('quick-duplicate').onclick=duplicateSelected;
function editSelected(){
 const item=selected();if(!item)return;
 showToolPanel('properties');
 if(item.kind==='annotation-line')el('item-angle').focus();
 else{el('item-name').focus();el('item-name').select();}
}
el('quick-properties').onclick=editSelected;
el('quick-menu').onclick=()=>{
 const button=el('quick-menu'),box=button.getBoundingClientRect();
 showObjectMenu(box.left,box.bottom+4,button);
};
diagram.addEventListener('dblclick',event=>{
 if(!placing&&event.target.closest('[data-item]'))editSelected();
});
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
 diagramScroll.scrollLeft=pan.left+pan.x-event.clientX;
 diagramScroll.scrollTop=pan.top+pan.y-event.clientY;
});
diagramScroll.addEventListener('lostpointercapture',()=>{
 pan=null;diagramScroll.classList.remove('panning');
});
let zoom=100;
function setZoom(value){
 const previous=zoom;
 zoom=clamp(value,50,400);
 const x=(diagramScroll.scrollLeft+diagramScroll.clientWidth/2)/previous;
 const y=(diagramScroll.scrollTop+diagramScroll.clientHeight/2)/previous;
 diagram.style.setProperty('--diagram-zoom',zoom+'%');
 el('zoom-reset').textContent=zoom+'%';
 el('zoom-out').disabled=zoom<=50;
 el('zoom-in').disabled=zoom>=400;
 diagramScroll.scrollTo(Math.max(0,x*zoom-diagramScroll.clientWidth/2),Math.max(0,y*zoom-diagramScroll.clientHeight/2));
 drawControls();
}
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
for(const [buttonId,inputId,isBackground] of [['import-symbol','svg-symbol-file',false],['import-background','svg-background-file',true]]){
 const input=el(inputId);
 el(buttonId).onclick=()=>input.click();
 input.onchange=async()=>{
  const file=input.files[0];input.value='';
  if(!file)return;
  const epoch=planEpoch;
  try{
   const asset=await importSvg(file);
   if(epoch!==planEpoch)return;
   const kept=isBackground?assets.filter(entry=>entry.id!==background||items.some(item=>item.assetId===entry.id)):assets;
   if(kept.length>=60||kept.reduce((size,item)=>size+item.data.length,asset.data.length)>650000)
    throw new Error('図面に保存できるSVGの容量を超えました。');
   assets=[...kept,asset];
   if(isBackground){background=asset.id;drawStage();}
   else{
    el('equipment-category').value='imported';el('equipment-search').value='';
    setPlacement(asset.id);
   }
   renderPalette();changed();
  }catch(error){status(error.message||'SVGを読み込めませんでした。');}
 };
}
el('remove-background').onclick=()=>{
 const old=background;
 background=null;
 assets=assets.filter(asset=>asset.id!==old||items.some(item=>item.assetId===old));
 drawStage();renderPalette();changed();
};

el('remove-item').onclick=()=>{
 items=items.filter(item=>item.id!==selectedId);
 selectedId=null;changed();draw();updateInspector();
};

function drawStage(){
 const image=el('diagram-background'),asset=assets.find(item=>item.id===background);
 image.toggleAttribute('hidden',!asset);
 diagram.classList.toggle('has-background',!!asset);
 el('remove-background').hidden=!asset;
 if(asset)image.setAttribute('href',asset.data);
 else image.removeAttribute('href');
 const template=stageTypes[stageType]||stageTypes.hall;
 const {x,y,w:width,h:height,scale}=geometry();
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
 line(42,610,42+100*scale,610);line(42,604,42,616);line(42+100*scale,604,42+100*scale,616);
 label(42+50*scale,635,'100 cm');

}
for(const field of ['x','y']){
 el('item-'+field).onchange=()=>{
  const item=selected(),value=el('item-'+field).valueAsNumber;
  if(!item||!dimensions||!Number.isFinite(value)){updateInspector();return;}
  const cm=positionCm(item);cm[field]=Math.round(value);
  const pos=positionSvg(cm.x,cm.y);
  if(pos.x<0||pos.x>1000||pos.y<0||pos.y>650){updateInspector();status('図面の範囲内の座標を入力してください。');return;}
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
  if(moved.some(item=>item.x<0||item.x>1000||item.y<0||item.y>650)){
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
function duplicateSelected(){
 const item=selected();
 if(!item)return;
 if(items.length>=200){status('1つの図面に配置できる機材は200件までです。');return;}
 const offset=dimensions?20*geometry().scale:12;
 const copy={...item,id:crypto.randomUUID(),...snapPosition({x:clamp(item.x+offset,0,1000),y:clamp(item.y+offset,0,650)})};
 items.push(copy);selectedId=copy.id;changed();draw();updateInspector();
 equipment.querySelector('[data-item="'+copy.id+'"]').focus({preventScroll:true});
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
  button.hidden=button.dataset.action==='reset'?!!selected():!selected();
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
 for(const node of equipment.children)node.setAttribute('aria-pressed',String(node.dataset.item===selectedId));
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
 if(!item)return;
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
el('rail-upload').onclick=()=>{showToolPanel('materials');el('import-symbol').click();};
el('rail-plans').onclick=()=>el('open-list').click();
el('add-text').onclick=()=>setPlacement('annotation-text');
el('add-line').onclick=()=>setPlacement('annotation-line');

function loadPlan(plan){
 closeObjectMenu();
 planEpoch++;
 setZoom(100);
 dimensions=plan.dimensions??null;
 assets=plan.assets??[];background=plan.background??null;
 renderPalette();
 venue=plan.venue??null;
 stageType=Object.hasOwn(stageTypes,plan.stageType)?plan.stageType:null;
 el('plan-welcome').hidden=true;el('plan-editor').hidden=false;
 drawStage();
 id=plan.id??null;version=plan.version??null;
 items=plan.items;el('plan-name').value=plan.title;
 clearTimeout(saveTimer);
 selectedId=null;setPlacement(null);dirty=false;
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
 if(opening||(!dirty&&!manual))return Promise.resolve();
 const title=el('plan-name').value.trim();
 if(!title){
  status('図面名を入力すると自動保存します。');
  if(manual)el('plan-name').focus();
  return Promise.resolve();
 }
 const plan={title,...(stageType?{stageType}:{}),...(dimensions?{dimensions}:{}),...(venue?{venue}:{}),assets,background,items:items.map(item=>({...item}))};
 el('save-plan').disabled=true;
 status('サーバーに保存しています…');
 saving=(async()=>{
  let succeeded=false;
  try{
   const result=await api('/stage/plans'+(id?'/'+id:''),{plan,version});
   id=result.id;version=result.version;
   dirty=JSON.stringify(plan)!==JSON.stringify({title:el('plan-name').value.trim(),...(stageType?{stageType}:{}),...(dimensions?{dimensions}:{}),...(venue?{venue}:{}),assets,background,items});
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
setupSession(async()=>{
 el('workspace').hidden=false;
 el('plan-welcome').hidden=false;
 try{await loadCatalog();typePicker.showModal();}
 catch(error){
  const message=document.createElement('p');
  message.setAttribute('role','alert');
  message.textContent='機材一覧を読み込めませんでした。ページを再読み込みしてください。';
  el('plan-welcome').append(message);
  el('welcome-new').disabled=el('welcome-open').disabled=true;
 }
},()=>dirty);
