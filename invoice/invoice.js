const el=id=>document.getElementById(id);
const documentTitles={invoice:'請求書',invoiceEstimate:'請求書兼見積書',estimate:'見積書'};
const fields=['documentVariant','recipient','honorific','date','number','subject','deliveryDate','dueDate','note','issuer','address','phone','taxRate','seal','sealName','sealShape','sealFont','signatureMode'];
let items=[{name:'',quantity:'1',unitPrice:'0'}],records=[],activeView='input';
const scrolls={};
let draftId=null;
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
el('date').value=today;el('deliveryDate').value=today;const [year,month]=today.split('-').map(Number);el('dueDate').value=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
function data(){return {...Object.fromEntries(fields.map(id=>[id,el(id).value])),items:items.map(item=>({...item})),bank:window.receiptSession?.issuer?.bank||null,documentType:'invoice'};}
function amount(value){return Number(value).toLocaleString('ja-JP')}
function totals(){return invoiceMath.calculate(items,Number(el('taxRate').value))}
function renderItems(){
 const root=el('items');root.replaceChildren();items.forEach((item,index)=>{
  const card=document.createElement('div');card.className='item-card';
  const heading=document.createElement('div');heading.className='item-heading';const title=document.createElement('span');title.textContent='明細 '+(index+1);
  const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.setAttribute('aria-label','明細'+(index+1)+'を削除');remove.onclick=()=>{items.splice(index,1);if(!items.length)items.push({name:'',quantity:'1',unitPrice:'0'});renderItems();render()};heading.append(title,remove);card.append(heading);
  const make=(key,label,attributes)=>{const group=document.createElement('div'),caption=document.createElement('label'),input=document.createElement('input');input.id='item-'+index+'-'+key;caption.htmlFor=input.id;caption.textContent=label;input.value=item[key];input.required=true;for(const [k,v] of Object.entries(attributes))input.setAttribute(k,v);input.oninput=()=>{items[index][key]=input.value;render()};group.append(caption,input);return group;};
  card.append(make('name','項目名',{maxlength:80}));const row=document.createElement('div');row.className='row';row.append(make('quantity','数量',{type:'number',min:'.001',step:'.001',max:'999999.999',inputmode:'decimal'}),make('unitPrice','単価（税抜・円）',{type:'number',min:0,step:1,max:999999999,inputmode:'numeric'}));card.append(row);root.append(card);
 });el('add-item').disabled=items.length>=25;
}
function svgElement(tag,attributes={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))n.setAttribute(key,value);if(text!==undefined)n.textContent=text;return n;}
let issuedSnapshot;
function render(){
 const d=issuedSnapshot||data(),title=documentTitles[d.documentVariant]||documentTitles.invoice,estimate=d.documentVariant==='estimate',svg=document.querySelector('.receipt-svg');svg.replaceChildren();let calc;try{calc=invoiceMath.calculate(d.items,Number(d.taxRate))}catch(error){el('totals').replaceChildren();const p=document.createElement('p');p.className='error';p.textContent=error.message;el('totals').append(p);calc={items:[],subtotal:0,tax:0,total:0}}
 if(calc.items.length){const summary=el('totals');summary.replaceChildren();for(const [label,value] of [['小計',calc.subtotal],['消費税',calc.tax],['税込合計',calc.total]]){const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('span');a.textContent=label;b.textContent='¥'+amount(value);row.append(a,b);summary.append(row)}}
 const line=(x,y,x2,y2,width=.5,color='#000')=>svg.append(svgElement('line',{x1:x,y1:y,x2,y2,stroke:color,'stroke-width':width}));
 const rect=(x,y,width,height,fill='none',stroke='none',strokeWidth=.5)=>svg.append(svgElement('rect',{x,y,width,height,fill,stroke,'stroke-width':strokeWidth}));
 const fit=[];
 const text=(value,x,y,size=8,width,anchor='start',weight=400,family)=>{const n=svgElement('text',{x,y,'font-size':size,'text-anchor':anchor,'font-weight':weight,fill:'#000'},value);if(family)n.style.fontFamily=family;svg.append(n);if(width)fit.push([n,width]);return n};
 const wrap=(value,x,y,width,size=8,maxLines=4)=>{const strings=[];let current='';for(const char of String(value||'')){if(char==='\n'||[...current].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?size:size*.55),0)+(char.charCodeAt(0)>255?size:size*.55)>width){strings.push(current);current=char==='\n'?'':char}else current+=char}if(current)strings.push(current);strings.slice(0,maxLines).forEach((s,i)=>text(i===maxLines-1?strings.slice(i).join(''):s,x,y+i*(size+2),size,width))};
 const editCell=(id,x,y,width,height,label)=>{
  if(issuedSnapshot)return;
  const cell=svgElement('rect',{x,y,width,height,fill:'transparent',class:'document-edit-cell',tabindex:'0',role:'button','aria-label':label,'data-field':id});
  const addItem=name=>{
   if(items.length>=25)return;
   items.push({name,quantity:'1',unitPrice:'0'});
   renderItems();
   render();
  };
  cell.addEventListener('click',()=>editPreviewCell(cell,id,label,addItem));
  cell.addEventListener('keydown',event=>{
   if(event.key==='Enter'||event.key===' '){event.preventDefault();editPreviewCell(cell,id,label,addItem);}
  });
  svg.append(cell);
 };
 const date=value=>value?value.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日'):'';
 rect(0,0,595.2756,841.8898,'#fff');
 text('発行日　'+date(d.date),352,69,8,146);line(350,72,500,72);text(d.number?'No.'+d.number:'No. 発行時に付与',352,82,8,146);line(350,85,500,85);
 text(title,307,109,17,240,'middle',700,'"Yu Mincho","Hiragino Mincho ProN",serif');
 text(d.recipient,97,147,9,182);text(d.honorific,282,151,9,30);line(94,156,314,156);
 text(d.issuer,354,165,8,92);wrap(d.address,354,179,91,7.5,4);text(d.phone?'TEL: '+d.phone:'',354,222,7.5,92);
 rect(449,169,51,70,'none','#777');rect(354,242,146,50,'none','#777');line(403,242,403,292,.5,'#777');line(451,242,451,292,.5,'#777');
 text('件　　名：',97,196,8);text(d.subject,138,196,8,176);line(135,205,314,205);text('納 品 日：',97,216,8);text(date(d.deliveryDate),138,216,8,176);line(135,219,314,219);text((estimate?'見積有効期限：':'お支払い期限：')+date(d.dueDate),97,230,8,218);
 text(estimate?'下記の通り、お見積り申し上げます。':'下記の通り、ご請求申し上げます。',97,252,8,220);text('金額',97,283,8);text('¥'+amount(calc.total),276,285,15,155,'end',500);text('（税込）',282,283,8,32);line(94,292,314,292,1);line(94,294,314,294,.5);
 const x=[94,134,278,310,350,500],top=307,rowHeight=12.5;
 line(94,top-3,500,top-3,2);rect(94,top,406,14,'#d9d9d9');
 text('No.',97,top+10,8,34,'start',700);text('項目',202,top+10,8,130,'middle',700);text('数量',294,top+10,8,28,'middle',700);text('単価',330,top+10,8,36,'middle',700);text('金額',425,top+10,8,145,'middle',700);
 for(let i=0;i<25;i++){const y=top+14+i*rowHeight;if(i%2===0)rect(94,y,406,rowHeight,'#ececec');const item=calc.items[i];if(item){text(String(i+1),97,y+9,7,33);text(item.name,137,y+9,7,137);text(item.quantity,307,y+9,7,28,'end');text(amount(item.unitPrice),347,y+9,7,34,'end');text(amount(item.amount),496,y+9,7,140,'end')}else text('0',496,y+9,7,140,'end')}
 const bottom=top+14+25*rowHeight;for(const col of x.slice(1,-1))line(col,top+14,col,bottom,.35,'#aaa');line(94,bottom,500,bottom,2);
 text('小計',315,bottom+11,8);text(amount(calc.subtotal),498,bottom+11,8,145,'end');rect(313,bottom+14,187,12,'#ececec');text('消費税',315,bottom+23,8);text(amount(calc.tax),498,bottom+23,8,145,'end');text('税込合計',315,bottom+37,8);text('¥'+amount(calc.total),498,bottom+37,8,145,'end');line(94,bottom+42,500,bottom+42,1);
 text('振込先',97,bottom+52,8,400,'start',700);const bank=d.bank||{};text(bank.name?(bank.name+'（'+(bank.type||'普通')+'）'):'',97,bottom+65,8,397,'start',600);text([bank.branch,bank.number].filter(Boolean).join('　'),97,bottom+77,8,397);text(bank.holder||'',97,bottom+89,8,397);line(94,738,500,738,.5);wrap(d.note,97,746,400,5.5,6);line(94,789,500,789,2);
 svg.append(svgElement('g',{id:'receipt-seal'}));updateSealPreview(d);
 editCell('date',350,56,150,17,'発行日を編集');
 editCell('recipient',94,130,185,26,'宛名を編集');
 editCell('honorific',279,130,35,26,'敬称を編集');
 editCell('subject',135,183,180,22,'件名を編集');
 editCell('deliveryDate',135,207,180,13,'納品日を編集');
 editCell('dueDate',97,221,218,16,estimate?'見積有効期限を編集':'支払期限を編集');
 editCell('note',94,739,406,49,'備考を編集');
 if(!issuedSnapshot){
  items.forEach((_,index)=>{
   const y=top+14+index*rowHeight;
   editCell('item-'+index+'-name',134,y,144,rowHeight,'明細 '+(index+1)+' の項目名を編集');
   editCell('item-'+index+'-quantity',278,y,32,rowHeight,'明細 '+(index+1)+' の数量を編集');
   editCell('item-'+index+'-unitPrice',310,y,40,rowHeight,'明細 '+(index+1)+' の単価を編集');
  });
  if(items.length<25){
   const y=top+14+items.length*rowHeight;
   editCell('item-'+items.length+'-name',134,y,144,rowHeight,'明細を追加');
  }
 }
 for(const [n,width] of fit){if(n.getComputedTextLength()>width){n.setAttribute('textLength',width);n.setAttribute('lengthAdjust','spacingAndGlyphs')}}
 el('due-date-label').textContent=estimate?'見積有効期限 *':'支払期限 *';
 if(issuedSnapshot)el('issued-panel').querySelector('h2').textContent='発行済みの'+title;
 const bankSummary=el('bank-summary');bankSummary.textContent=bank.name?[bank.name+'（'+bank.type+'）',bank.branch+'　'+bank.number,bank.holder].join('\n'):'振込先は未登録です。';
 const link=el('pdf-download');if(link.dataset.signature!==JSON.stringify(d)){link.hidden=true;el('pdf-status').textContent='';if(!el('print-preview').disabled)el('print-preview').textContent='本人確認して発行'}
}
window.openIssuedPreview = documentSnapshot => {
 issuedSnapshot = documentSnapshot;
 showView('preview');
};
function status(message){el('status').textContent=message}
function valid(){
 if(!window.receiptSession?.profile){el('auth-status').textContent='裏方アカウントでログインしてください。';return false}
 if(!window.receiptSession.issuer?.bank?.number){window.receiptSession.editIssuer();return false}
 if(el('signatureMode').value==='signed'&&!receiptSigningIdentity){showView('seal');document.querySelector('.signature-settings').open=true;el('certificate-status').textContent='電子署名に使う証明書を読み込んでください。';return false}
 if(el('seal').value==='generated'&&!el('sealName').value.trim()){showView('seal');el('seal-status').textContent='印鑑の文字を入力してください。';return false}
 const form=el('form');if(!form.checkValidity()){showView('input');form.reportValidity();return false}
 try{if(totals().total<1)throw Error('請求金額を入力してください。')}catch(error){showView('input');status(error.message);return false}return true;
}
function showView(name){scrolls[activeView]=window.scrollY;if(document.activeElement?.matches('input,textarea,select'))document.activeElement.blur();for(const key of ['input','seal','preview','history']){el(key+'-view').hidden=key!==name;el('tab-'+key).setAttribute('aria-selected',String(key===name));el('tab-'+key).tabIndex=key===name?0:-1}activeView=name;window.scrollTo(0,scrolls[name]||0);if(name==='preview')render();if(name==='seal')window.syncSealChoice?.();if(name==='history'&&window.receiptSession?.profile)window.receiptSession.refreshHistory().catch(e=>el('cloud-history-status').textContent=e.message)}
function renderHistory(){const root=el('history');root.replaceChildren();if(!records.length){const p=document.createElement('p');p.className='empty';p.textContent='記録はまだありません。';root.append(p)}records.forEach(record=>{const row=document.createElement('div');row.className='entry';const info=document.createElement('div'),badge=document.createElement('span');badge.className='record-kind '+record.kind;badge.textContent=(record.kind==='issued'?'発行済み':'下書き')+'・'+(documentTitles[record.data.documentVariant]||documentTitles.invoice);const title=document.createElement('strong');title.textContent=record.data.recipient+' '+record.data.honorific;const detail=document.createElement('small');detail.textContent=(record.kind==='issued'?'No.'+record.data.number+' / ':'')+'¥'+amount(record.data.total);const subject=document.createElement('small');subject.textContent=record.data.subject;info.append(badge,title,detail,subject);const b=document.createElement('button');b.type='button';b.textContent=record.kind==='issued'?'内容を複製':'編集';b.onclick=()=>{fields.forEach(id=>el(id).value=record.data[id]??({documentVariant:'invoice',taxRate:'10',seal:'hide',sealShape:'round',sealFont:'mincho',signatureMode:'unsigned'}[id]||''));items=record.data.items.map(item=>({name:item.name,quantity:String(item.quantity),unitPrice:String(item.unitPrice)}));draftId=record.kind==='draft'?record.id:null;el('number').value='';renderItems();window.receiptSession.applyIssuer();showView('input');render();status(record.kind==='issued'?'内容を複製しました。元の記録は変更されません。':'下書きを読み込みました。')};row.append(info,b);root.append(row)})}
async function saveDraft(){if(!valid())return false;[el('save'),el('save-preview')].forEach(b=>b.disabled=true);status('サーバーに保存中…');try{const saved=await window.receiptSession.saveDraft(data(),draftId);draftId=saved.id;status('サーバーに下書きを保存しました。');try{await window.receiptSession.refreshHistory()}catch{el('cloud-history-status').textContent='保存済みです。再読み込みしてください。'}return true}catch(error){status(error.message);el('pdf-status').textContent=error.message;return false}finally{[el('save'),el('save-preview')].forEach(b=>b.disabled=false)}}
async function issue(){if(!valid())return;showView('preview');render();const b=el('print-preview'),link=el('pdf-download');if(b.disabled)return;let snapshot=JSON.stringify(data());if(link.dataset.signature===snapshot&&link.href.startsWith('blob:')){const a=document.createElement('a');a.href=link.href;a.target='_blank';a.rel='noopener';a.click();return}b.disabled=true;b.textContent='PDF作成中…';link.hidden=true;try{el('number').value=await window.receiptSession.nextInvoiceNumber();snapshot=JSON.stringify(data());render();const blob=await createReceiptPdf(document.querySelector('.receipt-svg'));b.textContent='本人確認中…';await window.receiptSession.authorizeIssue(blob,JSON.parse(snapshot));if(snapshot!==JSON.stringify(data()))throw Error('内容が変わりました。再度確認してください。');if(link.href.startsWith('blob:'))URL.revokeObjectURL(link.href);link.href=URL.createObjectURL(blob);link.download=(documentTitles[JSON.parse(snapshot).documentVariant]||documentTitles.invoice)+'_'+el('number').value.replace(/[\\/:*?"<>|]/g,'_')+'.pdf';link.dataset.signature=snapshot;link.hidden=false;el('pdf-status').textContent='発行しました。PDFを開いて印刷、または保存してください。'}catch(error){el('number').value='';render();el('pdf-status').textContent=error.message||'発行できませんでした。'}finally{b.disabled=false;b.textContent=link.dataset.signature===snapshot&&!link.hidden?'PDFを開く':'本人確認して発行'}}
el('form').oninput=()=>{render();status('')};el('form').onsubmit=e=>{e.preventDefault();issue()};
el('add-item').onclick=()=>{if(items.length<25){items.push({name:'',quantity:'1',unitPrice:'0'});renderItems();render();el('item-'+(items.length-1)+'-name').focus()}};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
el('show-preview').onclick=()=>{if(valid())showView('preview')};el('save').onclick=saveDraft;el('save-preview').onclick=async()=>{if(await saveDraft())showView('history')};el('print-preview').onclick=issue;
el('new').onclick=()=>{draftId=null;el('number').value='';el('recipient').value='';el('subject').value='';items=[{name:'',quantity:'1',unitPrice:'0'}];renderItems();window.receiptSession.applyIssuer();showView('input');render();el('recipient').focus()};
el('history-refresh').onclick=async()=>{el('history-refresh').disabled=true;try{await window.receiptSession.refreshHistory()}catch(e){el('cloud-history-status').textContent=e.message}finally{el('history-refresh').disabled=false}};
window.addEventListener('receipt-cloud-history',e=>{records=e.detail;renderHistory();el('cloud-history-status').textContent=''});
['seal','sealName','sealShape','sealFont','signatureMode'].forEach(id=>el(id).oninput=render);el('load-certificate').onclick=loadReceiptCertificate;el('clear-certificate').onclick=forgetReceiptCertificate;
renderItems();render();renderHistory();
