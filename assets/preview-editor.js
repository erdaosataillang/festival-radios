let previewEditor;
function editPreviewCell(cell,id,label,onAdd){
 if(previewEditor||document.getElementById('print-preview').disabled)return;
 const source=document.getElementById(id);
 if(!source&&!onAdd)return;
 const editor=source?source.cloneNode(true):document.createElement('input');
 editor.removeAttribute('id');
 editor.removeAttribute('name');
 editor.className='document-cell-editor';
 editor.setAttribute('aria-label',label);
 editor.value=source?.value??'';
 if(!source)editor.maxLength=80;
 const bounds=cell.getBoundingClientRect();
 const width=Math.min(window.innerWidth-16,Math.max(bounds.width,editor.type==='date'?150:115));
 editor.style.width=width+'px';
 editor.style.left=Math.max(8,Math.min(bounds.left,window.innerWidth-width-8))+'px';
 editor.style.top=Math.max(8,Math.min(bounds.top,window.innerHeight-58))+'px';
 previewEditor=editor;
 document.body.append(editor);

 const finish=(commit,nextId)=>{
  if(previewEditor!==editor)return;
  previewEditor=null;
  editor.remove();
  window.removeEventListener('resize',cancel);
  window.removeEventListener('scroll',cancel,true);
  if(commit){
   if(source){
    source.value=editor.value;
    source.dispatchEvent(new Event('input',{bubbles:true}));
   }else if(editor.value.trim()){
    onAdd(editor.value);
   }
  }
  if(nextId){
   document.querySelector('.document-edit-cell[data-field="'+nextId+'"]')?.focus();
  }
 };
 const cancel=()=>finish(false);
 editor.addEventListener('blur',()=>finish(true));
 editor.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if(event.key==='Escape'){event.preventDefault();finish(false,id);}
  else if(event.key==='Enter'&&editor.tagName!=='TEXTAREA'){event.preventDefault();finish(true,id);}
  else if(event.key==='Tab'){
   const cells=[...document.querySelectorAll('.document-edit-cell')];
   const next=cells[cells.indexOf(cell)+(event.shiftKey?-1:1)];
   if(next){event.preventDefault();finish(true,next.dataset.field);document.activeElement?.dispatchEvent(new MouseEvent('click'));}
  }
 });
 window.addEventListener('resize',cancel);
 window.addEventListener('scroll',cancel,true);
 editor.focus({preventScroll:true});
 if(editor.type==='text'||editor.tagName==='TEXTAREA')editor.select();
}

