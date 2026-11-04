const sealNS = 'http://www.w3.org/2000/svg';
function sealElement(tag, attributes, text) {
  const element = document.createElementNS(sealNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}
function drawGeneratedSeal(target, name, shape, font) {
  target.replaceChildren();
  const color = '#d32f2f';
  const square = shape === 'square';
  const family = font === 'gothic' ? '"Noto Sans JP",sans-serif' : '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';
  if (square) {
    target.append(sealElement('rect', {x:9,y:9,width:202,height:202,rx:5,fill:'none',stroke:color,'stroke-width':7}));
    target.append(sealElement('rect', {x:19,y:19,width:182,height:182,rx:2,fill:'none',stroke:color,'stroke-width':2}));
  } else {
    target.append(sealElement('circle', {cx:110,cy:110,r:100,fill:'none',stroke:color,'stroke-width':7}));
    target.append(sealElement('circle', {cx:110,cy:110,r:91,fill:'none',stroke:color,'stroke-width':2}));
  }
  const chars = [...name.trim()].slice(0,8);
  if (!chars.length) return;
  const columns = chars.length > (square ? 2 : 4) ? 2 : 1;
  const rows = Math.ceil(chars.length / columns);
  const top = square ? 28 : (rows === 1 ? 49 : 30);
  const availableHeight = square ? 164 : (rows === 1 ? 122 : 160);
  const cellHeight = availableHeight / rows;
  const cellWidth = square ? 164 / columns : (columns === 1 ? 134 : 72);
  const size = Math.min(cellHeight * .92, cellWidth * .96);
  chars.forEach((char,index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const centerX = columns === 1 ? 110 : 110 + (column === 0 ? 42 : -42);
    const centerY = top + cellHeight * (row + .5);
    const text = sealElement('text', {x:centerX,y:centerY+size*.35,'text-anchor':'middle','font-size':size,'font-weight':700,fill:color}, char);
    text.style.fontFamily = family;
    target.append(text);
  });
}
function updateSealPreview(values) {
  const name = values.sealName || '';
  drawGeneratedSeal(document.getElementById('seal-preview'), name, values.sealShape, values.sealFont);
  const original = document.getElementById('receipt-seal');
  let generated = document.getElementById('receipt-generated-seal');
  if (!generated) {
    generated = sealElement('g', {id:'receipt-generated-seal',transform:'translate(458 194) scale(0.1454545)'});
    original.after(generated);
  }
  drawGeneratedSeal(generated, name, values.sealShape, values.sealFont);
  generated.style.display = values.seal === 'generated' ? '' : 'none';
  original.style.display = values.seal === 'show' ? '' : 'none';
}
async function saveGeneratedSeal() {
  if (!document.getElementById('sealName').value.trim()) {
    document.getElementById('seal-status').textContent = '印鑑に入れる文字を入力してください。';
    document.getElementById('sealName').focus();
    return;
  }
  const copy = document.getElementById('seal-preview').cloneNode(true);
  copy.setAttribute('width','880');
  copy.setAttribute('height','880');
  copy.removeAttribute('id');
  const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}));
  try {
    await document.fonts.ready;
    const image = new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=source});
    const canvas = document.createElement('canvas');
    canvas.width=880;canvas.height=880;
    canvas.getContext('2d').drawImage(image,0,0,880,880);
    const png = await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG generation failed')),'image/png'));
    const link = document.createElement('a');
    link.href=URL.createObjectURL(png);link.download='印鑑.png';link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),60000);
    document.getElementById('seal-status').textContent='透過PNGを保存しました。';
  } catch {
    document.getElementById('seal-status').textContent='印鑑を保存できませんでした。もう一度お試しください。';
  } finally {URL.revokeObjectURL(source)}
}
