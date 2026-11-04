/* A4 PDF containing only the receipt image, with no browser header/footer. */
function receiptImagePdf(jpeg, width, height, signature = false) {
  const encode = text => new TextEncoder().encode(text);
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = value => {
    const bytes = typeof value === 'string' ? encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  append('%PDF-1.4\n');
  object(1, `<< /Type /Catalog /Pages 2 0 R ${signature ? '/AcroForm << /SigFlags 3 /Fields [6 0 R] >>' : ''} >>`);
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /XObject << /Receipt 5 0 R >> >> /Contents 4 0 R ${signature ? '/Annots [6 0 R]' : ''} >>`);
  // The same 6 mm side margin and 19 mm top margin as the receipt template.
  const printWidth = 595.2756;
  const printHeight = 841.8898;
  const left = 0;
  const bottom = 0;
  const content = `q\n${printWidth.toFixed(4)} 0 0 ${printHeight.toFixed(4)} ${left.toFixed(4)} ${bottom.toFixed(4)} cm\n/Receipt Do\nQ\n`;
  object(4, `<< /Length ${encode(content).length} >>\nstream\n${content}endstream`);
  offsets[5] = length;
  append(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  append(jpeg);
  append('\nendstream\nendobj\n');
  if (signature) {
    object(6, '<< /Type /Annot /Subtype /Widget /FT /Sig /T (ReceiptSignature) /F 132 /Rect [0 0 0 0] /V 7 0 R /P 3 0 R >>');
    const date = new Date().toISOString().replace(/[-:T]/g, '').slice(0,14) + 'Z';
    object(7, `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0000000000 0000000000 0000000000] /Contents <${'0'.repeat(65536)}> /M (D:${date}) /Reason (Invoice issuance) >>`);
  }
  const count = signature ? 8 : 6;
  const xref = length;
  append(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return new Blob([result], { type: 'application/pdf' });
}

async function createReceiptPdf(svg) {
  await document.fonts.ready;
  const copy = svg.cloneNode(true);
  const view = svg.viewBox.baseVal;
  const width = Math.round(view.width * 4);
  const height = Math.round(view.height * 4);
  copy.setAttribute('width', width);
  copy.setAttribute('height', height);
  const originals = svg.querySelectorAll('text');
  copy.querySelectorAll('text').forEach((text, index) => {
    const computed = getComputedStyle(originals[index]);
    text.style.fontFamily = computed.fontFamily;
    text.style.fontSize = computed.fontSize;
    text.style.fontWeight = computed.fontWeight;
    text.style.whiteSpace = 'pre';
  });
  const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('領収書の画像を作成できませんでした。'));
      image.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('このブラウザではPDFを作成できません。');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const jpeg = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PDFを作成できませんでした。')), 'image/jpeg', 0.98));
    const signed = document.getElementById('signatureMode').value === 'signed';
    const pdf = receiptImagePdf(new Uint8Array(await jpeg.arrayBuffer()), width, height, signed);
    return signed ? await signReceiptPdf(pdf) : pdf;
  } finally {
    URL.revokeObjectURL(source);
  }
}
