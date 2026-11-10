export async function diagramPdf(diagram,{left,top,right,bottom},title){
 const width=right-left,height=bottom-top;
 const scale=2400/Math.max(width,height);
 const pixelWidth=Math.max(1,Math.round(width*scale)),pixelHeight=Math.max(1,Math.round(height*scale));
 const copy=diagram.cloneNode(true);
 copy.setAttribute('viewBox',[left,top,width,height].join(' '));
 copy.setAttribute('width',pixelWidth);copy.setAttribute('height',pixelHeight);
 const original=[...diagram.querySelectorAll('*')];
 [...copy.querySelectorAll('*')].forEach((node,index)=>{
  const style=getComputedStyle(original[index]);
  for(const property of ['fill','fill-opacity','stroke','stroke-width','stroke-dasharray','paint-order','font-family','font-size','font-weight','text-anchor','visibility']){
   const value=style.getPropertyValue(property);
   if(value&&!value.includes('url('))node.style.setProperty(property,value);
  }
  if(style.display==='none'&&node.id!=='diagram-rulers')node.remove();
 });
 for(const node of copy.querySelectorAll('#object-controls,#line-draft,#snap-guides,foreignObject,.object-name'))
  node.remove();
 const paper=copy.querySelector('#canvas-paper');
 for(const node of [paper,copy.querySelector('#grid')].filter(Boolean)){
  for(const [key,value] of Object.entries({x:left,y:top,width,height}))node.setAttribute(key,value);
 }
 const image=new Image();
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));
 const canvas=document.createElement('canvas');
 const header=70;
 canvas.width=pixelWidth;canvas.height=pixelHeight+header;
 try{
  image.src=url;await image.decode();
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#192326';ctx.font='600 32px sans-serif';ctx.fillText(title,24,45,Math.max(1,pixelWidth-48));
  ctx.drawImage(image,0,header,pixelWidth,pixelHeight);
 }finally{URL.revokeObjectURL(url);}
 const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
 if(!jpeg)throw new Error('PDFを生成できませんでした。');
 const safeTitle=title.replace(/[\\/:*?"<>|]/g,'_');
 return new File([imagePdf(new Uint8Array(await jpeg.arrayBuffer()),canvas.width,canvas.height)],safeTitle+'.pdf',{type:'application/pdf'});
}

function imagePdf(jpeg,width,height){
 const pageWidth=842,pageHeight=595;
 const ratio=Math.min((pageWidth-36)/width,(pageHeight-36)/height);
 const w=width*ratio,h=height*ratio;
 const stream=`q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${((pageWidth-w)/2).toFixed(3)} ${((pageHeight-h)/2).toFixed(3)} cm /Diagram Do Q\n`;
 const encoder=new TextEncoder(),parts=[],offsets=[0];
 let offset=0;
 const append=value=>{
  const bytes=typeof value==='string'?encoder.encode(value):value;
  parts.push(bytes);offset+=bytes.length;
 };
 function object(body,bytes){
  offsets.push(offset);append(`${offsets.length-1} 0 obj\n${body}`);
  if(bytes){append('stream\n');append(bytes);append('\nendstream');}
  append('\nendobj\n');
 }
 append('%PDF-1.4\n');
 object('<< /Type /Catalog /Pages 2 0 R >>');
 object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Diagram 4 0 R >> >> /Contents 5 0 R >>`);
 object(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\n`,jpeg);
 object(`<< /Length ${stream.length} >>\n`,encoder.encode(stream));
 const xref=offset;
 append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
 for(const position of offsets.slice(1))append(String(position).padStart(10,'0')+' 00000 n \n');
 append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 return new Blob(parts,{type:'application/pdf'});
}
