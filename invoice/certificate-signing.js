// The certificate, password and private key stay in browser memory only.
let receiptSigningIdentity = null;
function bytesToBinary(bytes) {
  let result = '';
  for (let i=0;i<bytes.length;i+=16384) result += String.fromCharCode(...bytes.subarray(i,i+16384));
  return result;
}
function parseSigningCertificate(bytes, password) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytesToBinary(bytes)), password);
  const oid = forge.pki.oids;
  const keys = [oid.pkcs8ShroudedKeyBag,oid.keyBag].flatMap(type=>p12.getBags({bagType:type})[type]||[]).map(b=>b.key).filter(Boolean);
  const certificates = (p12.getBags({bagType:oid.certBag})[oid.certBag]||[]).map(b=>b.cert).filter(Boolean);
  for (const key of keys) {
    if (!key.n || !key.e) continue;
    const cert = certificates.find(c=>c.publicKey.n?.compareTo(key.n)===0&&c.publicKey.e?.compareTo(key.e)===0);
    if (!cert) continue;
    const now = new Date();
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) throw new Error('証明書の有効期間外です。');
    const usage = cert.getExtension('keyUsage');
    if (usage&&!usage.digitalSignature&&!usage.nonRepudiation) throw new Error('この証明書は電子署名に利用できません。');
    return {key,cert,certificates};
  }
  throw new Error('RSAの秘密鍵と対応する証明書が必要です。');
}
async function loadReceiptCertificate() {
  const file = document.getElementById('certificateFile').files[0];
  const password = document.getElementById('certificatePassword');
  const status = document.getElementById('certificate-status');
  if (!file) {status.textContent='証明書ファイルを選択してください。';return;}
  if (file.size>5*1024*1024) {status.textContent='証明書ファイルは5MB以下を選択してください。';return;}
  status.textContent='証明書を読み込んでいます。';
  try {
    const identity = parseSigningCertificate(new Uint8Array(await file.arrayBuffer()),password.value);
    receiptSigningIdentity=identity;
    const name = identity.cert.subject.getField('CN')?.value || identity.cert.subject.getField('O')?.value || '名称なし';
    status.textContent='読み込み済み：'+name+' ／ 有効期限 '+identity.cert.validity.notAfter.toLocaleDateString('ja-JP');
    document.getElementById('signatureMode').value='signed';
    render();
  } catch (error) {
    // A previously loaded identity must not be silently reused after a failed import.
    receiptSigningIdentity=null;
    document.getElementById('signatureMode').value='unsigned';
    status.textContent=error.message.includes('証明書')||error.message.includes('RSA')?error.message:'読み込めませんでした。形式とパスワードを確認してください。';
  } finally {
    document.getElementById('pdf-download').dataset.signature='';
    render();
    password.value='';
    document.getElementById('certificateFile').value='';
  }
}
function forgetReceiptCertificate() {
  receiptSigningIdentity=null;
  document.getElementById('pdf-download').dataset.signature='';
  document.getElementById('certificateFile').value='';
  document.getElementById('certificatePassword').value='';
  document.getElementById('signatureMode').value='unsigned';
  document.getElementById('certificate-status').textContent='証明書を解除しました。';
  render();
}
async function signReceiptPdf(blob) {
  const identity = receiptSigningIdentity;
  if (!identity) throw new Error('電子署名に使う証明書を読み込んでください。');
  const now = new Date();
  if (now<identity.cert.validity.notBefore||now>identity.cert.validity.notAfter) throw new Error('証明書の有効期間外です。');
  const pdf = new Uint8Array(await blob.arrayBuffer());
  // Read only the ASCII signature dictionary at the end, not the JPEG stream.
  const tailStart = Math.max(0,pdf.length-70000);
  const tail = bytesToBinary(pdf.subarray(tailStart));
  const marker = '/ByteRange [0 0000000000 0000000000 0000000000]';
  const markerOffset = tail.indexOf(marker);
  const contentsOffset = tail.indexOf('/Contents <',markerOffset);
  if (markerOffset<0||contentsOffset<0) throw new Error('署名欄が見つかりません。');
  const start = tailStart+contentsOffset+'/Contents '.length;
  const end = start+65536+2;
  const range = `/ByteRange [0 ${String(start).padStart(10,'0')} ${String(end).padStart(10,'0')} ${String(pdf.length-end).padStart(10,'0')}]`;
  pdf.set(new TextEncoder().encode(range),tailStart+markerOffset);
  const content = bytesToBinary(pdf.subarray(0,start))+bytesToBinary(pdf.subarray(end));
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(content);
  identity.certificates.forEach(cert=>p7.addCertificate(cert));
  p7.addSigner({
    key:identity.key,certificate:identity.cert,digestAlgorithm:forge.pki.oids.sha256,
    authenticatedAttributes:[
      {type:forge.pki.oids.contentType,value:forge.pki.oids.data},
      {type:forge.pki.oids.messageDigest},
      {type:forge.pki.oids.signingTime,value:now}
    ]
  });
  p7.sign({detached:true});
  const hex = forge.util.bytesToHex(forge.asn1.toDer(p7.toAsn1()).getBytes());
  if (hex.length>65536) throw new Error('証明書のサイズが署名欄の上限を超えています。');
  pdf.set(new TextEncoder().encode(hex),start+1);
  return new Blob([pdf],{type:'application/pdf'});
}
