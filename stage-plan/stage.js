import {api,setupSession} from './session.js';

const tools={
 speaker:{label:'メインスピーカー',color:'#255a88',shape:'<rect x="-16" y="-21" width="32" height="42" rx="4"/><circle cy="8" r="8" fill="white"/><circle cy="-10" r="4" fill="white"/><path d="M-7 23h14L0 32z"/>'},
 monitor:{label:'モニター',color:'#326f64',shape:'<path d="M-21 14l7-28h28l7 28z"/><path d="M-12 4h24" stroke="white" stroke-width="3"/><path d="M-6 17H6L0 25z"/>'},
 sub:{label:'サブウーファー',color:'#47456a',shape:'<rect x="-23" y="-18" width="46" height="36" rx="4"/><circle r="12" fill="white"/><circle r="6"/>'},
 light:{label:'照明',color:'#99610e',shape:'<rect x="-12" y="-20" width="24" height="25" rx="5"/><path d="M-8 8L-24 29h48L8 8z" opacity=".38"/><path d="M-9 5H9" stroke="white" stroke-width="3"/>'},
 truss:{label:'トラス',color:'#5b6472',shape:'<rect x="-42" y="-8" width="84" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="3"/><path d="M-42 8l14-16 14 16L0-8 14 8 28-8 42 8" fill="none" stroke="currentColor" stroke-width="2"/>'},
};
const el=id=>document.getElementById(id);
const diagram=el('diagram');
const equipment=el('equipment');
const status=message=>{el('plan-status').textContent=message;};
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
let items=[],id=null,version=null,selectedId=null,placing=null,drag=null;
let dirty=false,saving=false,opening=false;
const selected=()=>items.find(item=>item.id===selectedId);
const changed=()=>{dirty=true;status('未保存の変更があります。');};

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

function addItem(position){
 if(items.length>=200){status('1つの図面に配置できる機材は200件までです。');return;}
 const kind=placing;
 const item={id:crypto.randomUUID(),kind,name:tools[kind].label,...position,angle:0,height:0};
 items.push(item);
 selectedId=item.id;
 setPlacement(null);
 changed();draw();updateInspector();
}

for(const [kind,tool] of Object.entries(tools)){
 const button=document.createElement('button');
 button.type='button';
 button.dataset.kind=kind;
 button.setAttribute('aria-pressed','false');
 const icon=svg('svg',{viewBox:'-45 -40 90 80',fill:tool.color,color:tool.color,'aria-hidden':'true'});
 icon.innerHTML=tool.shape;
 button.append(icon,document.createTextNode(tool.label));
 button.onclick=()=>setPlacement(placing===kind?null:kind);
 el('palette').append(button);
}

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
 const x=clamp(drag.x+end.x-drag.start.x,0,1000);
 const y=clamp(drag.y+end.y-drag.start.y,0,650);
 if(x===drag.item.x&&y===drag.item.y)return;
 drag.item.x=x;drag.item.y=y;
 equipment.querySelector('[data-item="'+drag.item.id+'"]').setAttribute('transform',`translate(${x} ${y})`);
 changed();
});
diagram.addEventListener('lostpointercapture',()=>{drag=null;});
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
  const step=event.shiftKey?25:5;
  item.x=clamp(item.x+step*direction[0],0,1000);
  item.y=clamp(item.y+step*direction[1],0,650);
  changed();
 }
 draw();updateInspector();
 equipment.querySelector('[data-item="'+selectedId+'"]').focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&placing)setPlacement(null);});
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

function loadPlan(plan){
 id=plan.id??null;version=plan.version??null;
 items=plan.items;el('plan-name').value=plan.title;
 selectedId=null;setPlacement(null);dirty=false;
 draw();updateInspector();
 status(id?'保存した図面を開きました。':'新しい図面です。');
}
const canReplace=()=>!saving&&!opening&&(!dirty||confirm('未保存の変更を破棄しますか？'));
el('new-plan').onclick=()=>{
 if(canReplace())loadPlan({title:'新しいステージ図面',items:[]});
};
el('save-plan').onclick=async()=>{
 if(saving||opening)return;
 const title=el('plan-name').value.trim();
 if(!title){status('図面名を入力してください。');el('plan-name').focus();return;}
 saving=true;el('save-plan').disabled=true;
 const plan={title,items:items.map(item=>({...item}))};
 status('保存しています…');
 try{
  const result=await api('/stage/plans'+(id?'/'+id:''),{plan,version});
  id=result.id;version=result.version;
  dirty=JSON.stringify(plan)!==JSON.stringify({title:el('plan-name').value.trim(),items});
  status(dirty?'保存後に変更があります。もう一度保存してください。':'サーバーに保存しました。');
 }catch(error){status(error.message||'保存できませんでした。');}
 finally{saving=false;el('save-plan').disabled=false;}
};
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
   button.append(document.createTextNode(plan.title),time);
   button.onclick=async()=>{
    if(!canReplace())return;
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
el('close-list').onclick=()=>el('plan-picker').close();
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
setupSession(()=>{el('workspace').hidden=false;draw();updateInspector();},()=>dirty);
