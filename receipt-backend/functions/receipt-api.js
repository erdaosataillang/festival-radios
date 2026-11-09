'use strict';
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const receiptData=require('./receipt-data');
const invoiceData=require('./invoice-data');
const APP='https://app.urakatabu.com',ACCOUNT='https://lmc-mobile.sorairosystem.com',REDIRECT=APP+'/recipt/',RP='app.urakatabu.com';
const CLIENTS={receipt:REDIRECT,invoice:APP+'/invoice/'};
const hash=value=>createHash('sha256').update(value).digest('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function fail(status,message){throw Object.assign(new Error(message),{status});}
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{32}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function createHandler({auth,db,Timestamp,webauthn,now=()=>Date.now()}){
 async function identity(req){
  let claims;try{claims=await auth.verifyIdToken((req.get('authorization')||'').replace(/^Bearer\s+/i,''),true);}catch{fail(401,'裏方アカウントでログインしてください。');}
  if(claims.line!==true||claims.registered!==true)fail(403,'登録済みの裏方アカウントが必要です。');
  const user=await db.doc('users/'+claims.uid).get(),data=user.data();
  if(!user.exists||data.disabled===true||data.active===false||data.receiptAccess===false||typeof data.name!=='string'||!data.name.trim())fail(403,'このアカウントは利用できません。');
  return {uid:claims.uid,name:data.name.trim().slice(0,80),authTime:claims.auth_time};
 }
 const credentials=uid=>db.collection('receiptUsers').doc(uid).collection('credentials');
 const sealRef=uid=>db.doc('receiptUsers/'+uid+'/settings/seal');
 const issuerRef=uid=>db.doc('receiptUsers/'+uid+'/settings/issuer');
 const records=(uid,type)=>db.collection('receiptUsers').doc(uid).collection(type);
 async function registeredIssuer(uid){const s=await issuerRef(uid).get();return s.exists?{...s.data(),updatedAt:s.get('updatedAt')?.toMillis()||0}:null;}
 async function challenge(user,kind,options,pdfHash,receipt){
  const challengeId=randomBytes(24).toString('base64url');
  await db.doc('receiptChallenges/'+challengeId).create({uid:user.uid,kind,challenge:options.challenge,expiresAt:Timestamp.fromMillis(now()+120000),...(pdfHash?{pdfHash}:{}),...(receipt?{receipt}:{})});
  return {challengeId,options};
 }
 function checkChallenge(s,user,kind){if(!s.exists||s.get('uid')!==user.uid||s.get('kind')!==kind||!s.get('expiresAt')||s.get('expiresAt').toMillis()<=now())fail(401,'認証の有効期限が切れました。もう一度お試しください。');}
 return async(req,res)=>{
  const origin=req.get('origin');res.set('Cache-Control','no-store');
  if([APP,ACCOUNT].includes(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}
  res.set('Access-Control-Allow-Headers','Content-Type, Authorization');res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.status([APP,ACCOUNT].includes(origin)?204:403).send('');return;}
  if(origin&&![APP,ACCOUNT].includes(origin)){res.status(403).json({error:'許可されていない接続元です。'});return;}
  const body=req.body||{};
  try{
   if(req.method==='POST'&&req.path==='/auth/code'){
    if(origin!==ACCOUNT||!Object.hasOwn(CLIENTS,body.clientId)||body.redirectUri!==CLIENTS[body.clientId]||body.codeChallengeMethod!=='S256'||typeof body.codeChallenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.codeChallenge))fail(400,'認証要求が正しくありません。');
    const user=await identity(req),code=randomBytes(32).toString('base64url');
    await db.doc('receiptAuthorizationCodes/'+hash(code)).create({uid:user.uid,redirectUri:body.redirectUri,challenge:body.codeChallenge,expiresAt:Timestamp.fromMillis(now()+60000)});res.json({code});return;
   }
   if(req.method==='POST'&&req.path==='/auth/exchange'){
    if(origin!==APP||!Object.values(CLIENTS).includes(body.redirectUri)||typeof body.code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.code)||typeof body.codeVerifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(body.codeVerifier))fail(400,'認証情報が正しくありません。');
    const ref=db.doc('receiptAuthorizationCodes/'+hash(body.code));
    const uid=await db.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||(s.get('redirectUri')||REDIRECT)!==body.redirectUri||s.get('expiresAt').toMillis()<=now()||!equal(hash(body.codeVerifier),s.get('challenge')))fail(401,'ログインをやり直してください。');t.delete(ref);return s.get('uid');});
    const account=await auth.getUser(uid),s=await db.doc('users/'+uid).get(),p=s.data();
    if(account.disabled||!s.exists||p.disabled===true||p.active===false||p.receiptAccess===false)fail(403,'このアカウントは利用できません。');
    res.json({customToken:await auth.createCustomToken(uid,{line:true,registered:true})});return;
   }
   const user=await identity(req);
   const refs=credentials(user.uid);
   if(req.method==='GET'&&req.path==='/me'){const [keys,issuer,seal]=await Promise.all([refs.limit(10).get(),registeredIssuer(user.uid),sealRef(user.uid).get()]);res.json({profile:{id:user.uid,name:user.name},passkeys:keys.size,issuer,seal:seal.exists?{...seal.data(),updatedAt:seal.get('updatedAt').toMillis()}:null});return;}
   if(origin!==APP)fail(403,'裏方部アプリから操作してください。');
   if(req.path==='/seal'&&req.method==='GET'){
    const seal=await sealRef(user.uid).get();res.json({seal:seal.exists?{...seal.data(),updatedAt:seal.get('updatedAt').toMillis()}:null});return;
   }
   if(req.path==='/seal'&&req.method==='POST'){
    const data=receiptData.seal(body.seal),ref=sealRef(user.uid);let saved;
    await db.runTransaction(async t=>{const s=await t.get(ref),version=s.exists?s.get('version'):null;if(body.version!==version)fail(409,'別の画面で印鑑が更新されています。「保存した印鑑を読み込む」を押してください。');saved={...data,version:(version||0)+1,updatedAt:Timestamp.fromMillis(now())};if(s.exists)t.update(ref,saved);else t.create(ref,saved);});
    res.json({seal:{...saved,updatedAt:saved.updatedAt.toMillis()}});return;
   }
   if(req.path==='/seals'&&req.method==='POST'){
    const seal=receiptData.seal(body.seal),ref=sealRef(user.uid);
    const name=typeof body.name==='string'?body.name.trim():'';
    if(!name||name.length>40)fail(400,'印鑑名を40文字以内で入力してください。');
    const seals=await db.runTransaction(async t=>{
     const current=await t.get(ref),data=current.data();
     const list=data?.seals??(data?.sealName?[{id:'legacy',name:data.sealName,...receiptData.seal(data)}]:[]);
     const same=list.find(item=>item.name===name);
     if(same){
      if(same.sealName===seal.sealName&&same.sealShape===seal.sealShape&&same.sealFont===seal.sealFont)return list;
      fail(409,'同じ名前の印鑑があります。別の名前を入力してください。');
     }
     if(list.length>=30)fail(409,'登録できる印鑑は30件までです。');
     const next=[...list,{...seal,id:randomBytes(12).toString('hex'),name}];
     if(current.exists)t.update(ref,{seals:next});
     else t.create(ref,{...seal,seals:next,version:1,updatedAt:Timestamp.fromMillis(now())});
     return next;
    });
    res.json({seals});return;
   }
   if(req.path==='/issuer'&&req.method==='POST'){
    const data=receiptData.issuer(body.issuer),ref=issuerRef(user.uid);let saved;
    const bank=body.issuer.bank===undefined?undefined:invoiceData.bank(body.issuer.bank);
    await db.runTransaction(async t=>{const s=await t.get(ref),version=s.exists?s.get('version'):null;if(body.version!==version)fail(409,'別の画面で発行者情報が更新されています。再読み込みしてください。');const bankData=bank===undefined?s.get('bank'):bank;saved={...data,...(bankData?{bank:bankData}:{}),version:(version||0)+1,updatedAt:Timestamp.fromMillis(now())};if(s.exists)t.update(ref,saved);else t.create(ref,saved);});
    res.json({issuer:{...saved,updatedAt:saved.updatedAt.toMillis()}});return;
   }
   const invoiceMode=req.path.startsWith('/invoices/');
   const invoiceSequence=db.doc('receiptSettings/invoiceSequence');
   const nextInvoiceNumber=snapshot=>snapshot.get('next')??100;
   if(req.method==='GET'&&req.path==='/invoices/next-number'){
    res.json({number:String(nextInvoiceNumber(await invoiceSequence.get()))});return;
   }
   const issuedMatch = req.path.match(/^\/(invoices\/)?issued\/([A-Za-z0-9]{20})$/);
   if (req.method === 'GET' && issuedMatch) {
    const record = await records(user.uid, issuedMatch[1] ? 'invoices' : 'receipts').doc(issuedMatch[2]).get();
    if (!record.exists) fail(404, 'この発行記録を閲覧できません。');
    res.json({document:record.get('receipt')});
    return;
   }
   if(['/drafts','/invoices/drafts'].includes(req.path)&&req.method==='POST'){
    const registered=await registeredIssuer(user.uid);
    const receipt=invoiceMode?invoiceData.invoice(body.receipt,registered,body.issuerVersion,{draft:true}):receiptData.receipt(body.receipt,registered,body.issuerVersion);
    const drafts=records(user.uid,invoiceMode?'invoiceDrafts':'drafts');
    if(invoiceMode&&body.draftId!=null&&!/^[A-Za-z0-9_-]{20,43}$/.test(body.draftId))fail(400,'下書きが見つかりません。');
    const ref=invoiceMode?(body.draftId?drafts.doc(body.draftId):drafts.doc()):drafts.doc(hash(receipt.number+'\0'+receipt.permanent));
    const updatedAt=Timestamp.fromMillis(now());
    await db.runTransaction(async t=>{const issuer=await t.get(issuerRef(user.uid)),draft=await t.get(ref);if(!issuer.exists||issuer.get('version')!==registered.version)fail(409,'発行者情報が更新されました。再読み込みしてください。');const data={uid:user.uid,receipt,updatedAt};if(draft.exists)t.update(ref,data);else t.create(ref,data);});
    res.json({ok:true,id:ref.id});return;
   }
   if(['/history','/invoices/history'].includes(req.path)&&req.method==='GET'){
    const [issued,drafts]=await Promise.all([records(user.uid,invoiceMode?'invoices':'receipts').orderBy('issuedAt','desc').limit(100).get(),records(user.uid,invoiceMode?'invoiceDrafts':'drafts').orderBy('updatedAt','desc').limit(100).get()]);
    const rows=[...issued.docs.map(s=>({id:s.id,kind:'issued',data:s.get('receipt'),pdfHash:s.get('pdfHash'),at:s.get('issuedAt').toMillis()})),...drafts.docs.map(s=>({id:s.id,kind:'draft',data:s.get('receipt'),at:s.get('updatedAt').toMillis()}))].sort((a,b)=>b.at-a.at);
    res.json({records:rows});return;
   }
   if(req.method==='POST'&&req.path==='/passkeys/register/options'){
    if(!Number.isFinite(user.authTime)||now()/1000-user.authTime>300)fail(401,'パスキー登録の前に裏方アカウントで再ログインしてください。');
    const keys=await refs.limit(10).get();if(keys.size>=8)fail(400,'登録できるパスキーは8件までです。');
    const options=await webauthn.generateRegistrationOptions({rpName:'裏方アカウント',rpID:RP,userID:Buffer.from(user.uid),userName:user.name,userDisplayName:user.name,attestationType:'none',excludeCredentials:keys.docs.map(d=>({id:d.get('credentialId'),transports:d.get('transports')})),authenticatorSelection:{residentKey:'preferred',authenticatorAttachment:'platform',userVerification:'required'}});
    res.json(await challenge(user,'registration',options));return;
   }
   if(req.method==='POST'&&req.path==='/passkeys/register/verify'){
    if(!id(body.challengeId)||!body.response)fail(400,'認証応答が正しくありません。');
    const ref=db.doc('receiptChallenges/'+body.challengeId),s=await ref.get();checkChallenge(s,user,'registration');
    let verification;try{verification=await webauthn.verifyRegistrationResponse({response:body.response,expectedChallenge:s.get('challenge'),expectedOrigin:APP,expectedRPID:RP,requireUserVerification:true});}catch{fail(401,'パスキーの本人確認に失敗しました。');}
    if(!verification.verified||!verification.registrationInfo?.userVerified)fail(401,'本人確認が必要です。');
    const info=verification.registrationInfo,c=info.credential,keyRef=refs.doc(hash(c.id));
    await db.runTransaction(async t=>{checkChallenge(await t.get(ref),user,'registration');const count=await t.get(refs.limit(9));if(count.size>=8)fail(400,'登録できるパスキーは8件までです。');t.create(keyRef,{credentialId:c.id,publicKey:Buffer.from(c.publicKey).toString('base64'),counter:c.counter,transports:c.transports||[],createdAt:Timestamp.fromMillis(now())});t.delete(ref);});
    res.json({ok:true});return;
   }
   if(req.method==='POST'&&['/issue/options','/invoices/issue/options'].includes(req.path)){
    if(!digest(body.pdfHash))fail(400,'PDFを確認してください。');const keys=await refs.limit(10).get();if(!keys.size)fail(409,'発行前にパスキーを登録してください。');
    const registered=await registeredIssuer(user.uid),receipt=(invoiceMode?invoiceData.invoice:receiptData.receipt)(body.receipt,registered,body.issuerVersion);
    if(body.receipt.issuer!==receipt.issuer||body.receipt.address!==receipt.address||body.receipt.phone!==receipt.phone)fail(409,'登録済みの発行者情報を反映してから発行してください。');
    if(invoiceMode&&receipt.number!==String(nextInvoiceNumber(await invoiceSequence.get())))fail(409,'請求書番号が更新されました。もう一度発行してください。');
    if(invoiceMode&&['name','branch','type','number','holder'].some(key=>body.receipt.bank?.[key]!==receipt.bank[key]))fail(409,'登録済みの振込先を反映してから発行してください。');
    const options=await webauthn.generateAuthenticationOptions({rpID:RP,userVerification:'required',allowCredentials:keys.docs.map(d=>({id:d.get('credentialId'),transports:d.get('transports')}))});
    res.json(await challenge(user,invoiceMode?'invoice-issuance':'issuance',options,body.pdfHash,receipt));return;
   }
   if(req.method==='POST'&&['/issue/verify','/invoices/issue/verify'].includes(req.path)){
    if(!id(body.challengeId)||!digest(body.pdfHash)||typeof body.response?.id!=='string'||body.response.id.length>2048)fail(400,'認証応答が正しくありません。');
    const kind=invoiceMode?'invoice-issuance':'issuance',ref=db.doc('receiptChallenges/'+body.challengeId),s=await ref.get();checkChallenge(s,user,kind);if(!equal(body.pdfHash,s.get('pdfHash')))fail(400,'PDFが変更されました。認証をやり直してください。');
    const keyRef=refs.doc(hash(body.response.id)),key=await keyRef.get();if(!key.exists)fail(403,'このアカウントのパスキーではありません。');
    if(body.response.response?.userHandle&&!equal(body.response.response.userHandle,Buffer.from(user.uid).toString('base64url')))fail(403,'アカウントが一致しません。');
    let verification;try{verification=await webauthn.verifyAuthenticationResponse({response:body.response,expectedChallenge:s.get('challenge'),expectedOrigin:APP,expectedRPID:RP,requireUserVerification:true,credential:{id:key.get('credentialId'),publicKey:new Uint8Array(Buffer.from(key.get('publicKey'),'base64')),counter:key.get('counter'),transports:key.get('transports')}});}catch{fail(401,'パスキーの本人確認に失敗しました。');}
    if(!verification.verified||!verification.authenticationInfo?.userVerified)fail(401,'本人確認が必要です。');
    const issuance=db.collection('receiptIssuances').doc(),record=records(user.uid,invoiceMode?'invoices':'receipts').doc(issuance.id),documentType=invoiceMode?'invoice':'receipt';
    await db.runTransaction(async t=>{const fresh=await t.get(ref),freshKey=await t.get(keyRef),registered=await t.get(issuerRef(user.uid));checkChallenge(fresh,user,kind);if(!equal(fresh.get('pdfHash'),body.pdfHash)||!freshKey.exists||freshKey.get('counter')!==key.get('counter'))fail(409,'認証をやり直してください。');if(!fresh.get('receipt')||!registered.exists||registered.get('version')!==fresh.get('receipt').issuerVersion)fail(409,'発行者情報が更新されました。発行をやり直してください。');const snapshot=fresh.get('receipt');
    if(invoiceMode){
     const sequence=await t.get(invoiceSequence),next=nextInvoiceNumber(sequence);
     if(snapshot.number!==String(next))fail(409,'別の請求書が先に発行されました。もう一度発行してください。');
     if(sequence.exists)t.update(invoiceSequence,{next:next+1});
     else t.create(invoiceSequence,{next:next+1});
    }
    const issuedAt=Timestamp.fromMillis(now());t.update(keyRef,{counter:verification.authenticationInfo.newCounter,lastUsedAt:issuedAt});t.create(issuance,{uid:user.uid,actorName:user.name,documentType,...(invoiceMode?{documentVariant:snapshot.documentVariant??'invoice'}:{}),pdfHash:body.pdfHash,credential:hash(body.response.id),issuedAt});t.create(record,{uid:user.uid,documentType,actorName:user.name,receipt:fresh.get('receipt'),pdfHash:body.pdfHash,issuedAt});t.delete(ref);});
    res.json({ok:true,issuanceId:issuance.id,pdfHash:body.pdfHash});return;
   }
   fail(404,'操作が見つかりません。');
  }catch(error){if(error.status)res.status(error.status).json({error:error.message});else{console.error('Receipt API error',{code:error.code});res.status(503).json({error:'処理できませんでした。もう一度お試しください。'});}}
 };
}
module.exports={createHandler};
