import {api,setupSession} from './session.js';
import {equipmentShape} from './equipment-symbols.js';

const stageTypes={
 hall:{label:'ホール',description:'舞台と客席の区画が分かれた会場',bounds:[155,82,690,335]},
 multipurpose:{label:'多目的ホール',description:'室内にステージと客席を配置する会場',bounds:[205,95,590,245]},
 temporary:{label:'仮設ステージ',description:'屋外やイベント会場に設置するステージ',bounds:[275,130,450,210]},
};
let stageType=null,dimensions=null,venue=null;
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
async function loadCatalog(){
 const response=await fetch(new URL('./catalog.json?v=1',import.meta.url));
 if(!response.ok)throw new Error('機材一覧を読み込めませんでした。');
 for(const {id,label,group,symbol,mark} of await response.json())
  tools[id]={label,group,color:colors[group],shape:equipmentShape(symbol,mark)};
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
const snapshot=()=>({title:el('plan-name').value,items:items.map(item=>({...item})),selectedId,dimensions,venue});
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
 dirty=true;
 status('変更を自動保存します…');
 scheduleSave();
}
function restoreChange(from,to){
 if(!from.length)return;
 const focused=diagram.contains(document.activeElement);
 to.push(snapshot());
 const state=from.pop();
 dimensions=state.dimensions;venue=state.venue;drawStage();items=state.items;selectedId=state.selectedId;el('plan-name').value=state.title;
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
 el('placement-help').textContent=kind?tools[kind].label+'を置く位置をクリックまたはタップしてください。':'機材を選び、図面をクリックまたはタップして配置します。';
}

function updateInspector(){
 const item=selected();
 el('empty-selection').hidden=!!item;
 el('item-fields').hidden=!item;
 if(!item)return;
 el('item-name').value=item.name;
 el('item-angle').value=item.angle;
 el('item-height').value=item.height;
 const pos=positionCm(item);
 el('item-x').value=dimensions?pos.x:'';el('item-y').value=dimensions?pos.y:'';
 el('item-x').disabled=el('item-y').disabled=!dimensions;
}

function draw(){
 equipment.replaceChildren();
 for(const item of items){
  const tool=tools[item.kind];
  const group=svg('g',{
   transform:`translate(${item.x} ${item.y})`,tabindex:0,role:'button',
   'aria-label':item.name||tool.label,'aria-pressed':String(item.id===selectedId),
   class:'equipment-item'+(item.id===selectedId?' selected':''),
   'data-item':item.id,
  });
  const symbol=svg('g',{transform:`rotate(${item.angle})`,fill:tool.color,color:tool.color});
  symbol.innerHTML=tool.shape;
  const hit=svg('rect',{x:-46,y:-37,width:92,height:74,rx:6,fill:'transparent'});
  const outline=svg('rect',{x:-46,y:-37,width:92,height:74,rx:6,class:'selection'});
  const label=svg('text',{y:49,'pointer-events':'none'});
  label.textContent=item.name||tool.label;
  group.append(hit,symbol,outline,label);
  equipment.append(group);
 }
}

function point(event){
 const pos=new DOMPoint(event.clientX,event.clientY).matrixTransform(diagram.getScreenCTM().inverse());
 return {x:Math.round(clamp(pos.x,0,1000)),y:Math.round(clamp(pos.y,0,650))};
}

function snapPosition(pos){
 if(!dimensions)return pos;
 const frame=geometry(),cm=positionCm(pos,frame);
 const snapped=positionSvg(cm.x,cm.y,frame);
 return {x:clamp(snapped.x,0,1000),y:clamp(snapped.y,0,650)};
}
function addItem(position){
 if(items.length>=200){status('1つの図面に配置できる機材は200件までです。');return;}
 const kind=placing;
 const item={id:crypto.randomUUID(),kind,name:tools[kind].label,...snapPosition(position),angle:0,height:0};
 items.push(item);
 selectedId=item.id;
 setPlacement(null);
 changed();draw();updateInspector();
}

function renderPalette(){
 const palette=el('palette'),category=el('equipment-category').value;
 const query=el('equipment-search').value.trim().normalize('NFKC').toLowerCase();
 const matches=Object.entries(tools).filter(([kind,tool])=>{
  if(query)return (category==='quick'||category==='all'||tool.group===category)&&
   (tool.label.normalize('NFKC').toLowerCase().includes(query)||kind.includes(query));
  return category==='all'||(category==='quick'?quickTools.includes(kind):tool.group===category);
 });
 palette.replaceChildren();
 el('equipment-count').textContent=matches.length+'件';
 for(const [kind,tool] of matches){
  const button=document.createElement('button');
  button.type='button';button.dataset.kind=kind;
  button.setAttribute('aria-pressed',String(kind===placing));
  const icon=svg('svg',{viewBox:'-45 -40 90 80',fill:tool.color,color:tool.color,'aria-hidden':'true'});
  icon.innerHTML=tool.shape;
  button.append(icon,document.createTextNode(tool.label));
  button.onclick=()=>setPlacement(placing===kind?null:kind);
  palette.append(button);
 }
}
el('equipment-category').onchange=renderPalette;
el('equipment-search').oninput=renderPalette;

diagram.addEventListener('pointerdown',event=>{
 if(event.button!==0)return;
 if(placing){event.preventDefault();addItem(point(event));return;}
 const target=event.target.closest('[data-item]');
 if(!target){selectedId=null;draw();updateInspector();return;}
 selectedId=target.dataset.item;
 const item=selected(),start=point(event);
 drag={pointer:event.pointerId,item,start,x:item.x,y:item.y};
 diagram.setPointerCapture(event.pointerId);
 target.focus({preventScroll:true});
 for(const node of equipment.children){
  const active=node.dataset.item===selectedId;
  node.classList.toggle('selected',active);
  node.setAttribute('aria-pressed',String(active));
 }
 updateInspector();
});
diagram.addEventListener('pointermove',event=>{
 if(!drag||event.pointerId!==drag.pointer)return;
 const end=point(event);
 const {x,y}=snapPosition({x:clamp(drag.x+end.x-drag.start.x,0,1000),y:clamp(drag.y+end.y-drag.start.y,0,650)});
 if(x===drag.item.x&&y===drag.item.y)return;
 drag.item.x=x;drag.item.y=y;
 equipment.querySelector('[data-item="'+drag.item.id+'"]').setAttribute('transform',`translate(${x} ${y})`);
 changed();
});
diagram.addEventListener('lostpointercapture',()=>{drag=null;updateInspector();scheduleSave();});
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
 if(event.defaultPrevented||event.isComposing||el('plan-editor').hidden||document.querySelector('dialog[open]'))return;
 const key=event.key.toLowerCase(),command=event.metaKey||event.ctrlKey;
 if(command&&!event.altKey&&key==='s'){
  event.preventDefault();savePlan(true);return;
 }
 if(event.target.closest?.('input, textarea, select, [contenteditable]'))return;
 if(command&&!event.altKey&&(key==='z'||key==='y')){
  event.preventDefault();
  if(key==='y'||event.shiftKey)restoreChange(redoStack,undoStack);
  else restoreChange(undoStack,redoStack);
 }else if(!command&&!event.altKey){
  if(key==='escape'&&placing)setPlacement(null);
  if((key==='delete'||key==='backspace')&&selected()){
   event.preventDefault();el('remove-item').click();
  }
  if(/^[1-5]$/.test(key)){
   event.preventDefault();setPlacement(quickTools[Number(key)-1]);
  }
 }
});
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
el('remove-item').onclick=()=>{
 items=items.filter(item=>item.id!==selectedId);
 selectedId=null;changed();draw();updateInspector();
};

function drawStage(){
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
function loadPlan(plan){
 dimensions=plan.dimensions??null;
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
 const plan={title,...(stageType?{stageType}:{}),...(dimensions?{dimensions}:{}),...(venue?{venue}:{}),items:items.map(item=>({...item}))};
 el('save-plan').disabled=true;
 status('サーバーに保存しています…');
 saving=(async()=>{
  let succeeded=false;
  try{
   const result=await api('/stage/plans'+(id?'/'+id:''),{plan,version});
   id=result.id;version=result.version;
   dirty=JSON.stringify(plan)!==JSON.stringify({title:el('plan-name').value.trim(),...(stageType?{stageType}:{}),...(dimensions?{dimensions}:{}),...(venue?{venue}:{}),items});
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
