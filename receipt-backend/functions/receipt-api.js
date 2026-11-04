'use strict';
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const APP='https://app.urakatabu.com',ACCOUNT='https://lmc-mobile.sorairosystem.com',REDIRECT=APP+'/recipt/',RP='app.urakatabu.com';
const hash=value=>createHash('sha256').update(value).digest('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function fail(status,message){throw Object.assign(new Error(message),{status});}
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{32}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function createHandler({auth,db,Timestamp,webauthn,now=()=>Date.now()}){
 async function identity(req){
  let claims;try{claims=await auth.verifyIdToken((req.get('authorization')||'').replace(/^Bearer\s+/i,''),true);}catch{fail(401,'LMCアカウントでログインしてください。');}
  if(claims.line!==true||claims.registered!==true)fail(403,'登録済みのLMCアカウントが必要です。');
  const user=await db.doc('users/'+claims.uid).get(),data=user.data();
  if(!user.exists||data.disabled===true||data.active===false||data.receiptAccess===false||typeof data.name!=='string'||!data.name.trim())fail(403,'このアカウントは利用できません。');
  return {uid:claims.uid,name:data.name.trim().slice(0,80),authTime:claims.auth_time};
 }
 const credentials=uid=>db.collection('receiptUsers').doc(uid).collection('credentials');
 async function challenge(user,kind,options,pdfHash){
  const challengeId=randomBytes(24).toString('base64url');
  await db.doc('receiptChallenges/'+challengeId).create({uid:user.uid,kind,challenge:options.challenge,expiresAt:Timestamp.fromMillis(now()+120000),...(pdfHash?{pdfHash}:{})});
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
    if(origin!==ACCOUNT||body.clientId!=='receipt'||body.redirectUri!==REDIRECT||body.codeChallengeMethod!=='S256'||typeof body.codeChallenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.codeChallenge))fail(400,'認証要求が正しくありません。');
    const user=await identity(req),code=randomBytes(32).toString('base64url');
    await db.doc('receiptAuthorizationCodes/'+hash(code)).create({uid:user.uid,challenge:body.codeChallenge,expiresAt:Timestamp.fromMillis(now()+60000)});res.json({code});return;
   }
   if(req.method==='POST'&&req.path==='/auth/exchange'){
    if(origin!==APP||body.redirectUri!==REDIRECT||typeof body.code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.code)||typeof body.codeVerifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(body.codeVerifier))fail(400,'認証情報が正しくありません。');
    const ref=db.doc('receiptAuthorizationCodes/'+hash(body.code));
    const uid=await db.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||s.get('expiresAt').toMillis()<=now()||!equal(hash(body.codeVerifier),s.get('challenge')))fail(401,'ログインをやり直してください。');t.delete(ref);return s.get('uid');});
    const account=await auth.getUser(uid),s=await db.doc('users/'+uid).get(),p=s.data();
    if(account.disabled||!s.exists||p.disabled===true||p.active===false||p.receiptAccess===false)fail(403,'このアカウントは利用できません。');
    res.json({customToken:await auth.createCustomToken(uid,{line:true,registered:true})});return;
   }
   const user=await identity(req);
   const refs=credentials(user.uid);
   if(req.method==='GET'&&req.path==='/me'){const keys=await refs.limit(10).get();res.json({profile:{id:user.uid,name:user.name},passkeys:keys.size});return;}
   if(origin!==APP)fail(403,'領収書アプリから操作してください。');
   if(req.method==='POST'&&req.path==='/passkeys/register/options'){
    if(!Number.isFinite(user.authTime)||now()/1000-user.authTime>300)fail(401,'パスキー登録の前にLMCへ再ログインしてください。');
    const keys=await refs.limit(10).get();if(keys.size>=8)fail(400,'登録できるパスキーは8件までです。');
    const options=await webauthn.generateRegistrationOptions({rpName:'裏方部 領収書',rpID:RP,userID:Buffer.from(user.uid),userName:user.name,userDisplayName:user.name,attestationType:'none',excludeCredentials:keys.docs.map(d=>({id:d.get('credentialId'),transports:d.get('transports')})),authenticatorSelection:{residentKey:'preferred',authenticatorAttachment:'platform',userVerification:'required'}});
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
   if(req.method==='POST'&&req.path==='/issue/options'){
    if(!digest(body.pdfHash))fail(400,'PDFを確認してください。');const keys=await refs.limit(10).get();if(!keys.size)fail(409,'発行前にパスキーを登録してください。');
    const options=await webauthn.generateAuthenticationOptions({rpID:RP,userVerification:'required',allowCredentials:keys.docs.map(d=>({id:d.get('credentialId'),transports:d.get('transports')}))});
    res.json(await challenge(user,'issuance',options,body.pdfHash));return;
   }
   if(req.method==='POST'&&req.path==='/issue/verify'){
    if(!id(body.challengeId)||!digest(body.pdfHash)||typeof body.response?.id!=='string'||body.response.id.length>2048)fail(400,'認証応答が正しくありません。');
    const ref=db.doc('receiptChallenges/'+body.challengeId),s=await ref.get();checkChallenge(s,user,'issuance');if(!equal(body.pdfHash,s.get('pdfHash')))fail(400,'PDFが変更されました。認証をやり直してください。');
    const keyRef=refs.doc(hash(body.response.id)),key=await keyRef.get();if(!key.exists)fail(403,'このアカウントのパスキーではありません。');
    if(body.response.response?.userHandle&&!equal(body.response.response.userHandle,Buffer.from(user.uid).toString('base64url')))fail(403,'アカウントが一致しません。');
    let verification;try{verification=await webauthn.verifyAuthenticationResponse({response:body.response,expectedChallenge:s.get('challenge'),expectedOrigin:APP,expectedRPID:RP,requireUserVerification:true,credential:{id:key.get('credentialId'),publicKey:new Uint8Array(Buffer.from(key.get('publicKey'),'base64')),counter:key.get('counter'),transports:key.get('transports')}});}catch{fail(401,'パスキーの本人確認に失敗しました。');}
    if(!verification.verified||!verification.authenticationInfo?.userVerified)fail(401,'本人確認が必要です。');
    const issuance=db.collection('receiptIssuances').doc();
    await db.runTransaction(async t=>{const fresh=await t.get(ref),freshKey=await t.get(keyRef);checkChallenge(fresh,user,'issuance');if(!equal(fresh.get('pdfHash'),body.pdfHash)||!freshKey.exists||freshKey.get('counter')!==key.get('counter'))fail(409,'認証をやり直してください。');t.update(keyRef,{counter:verification.authenticationInfo.newCounter,lastUsedAt:Timestamp.fromMillis(now())});t.create(issuance,{uid:user.uid,pdfHash:body.pdfHash,credential:hash(body.response.id),issuedAt:Timestamp.fromMillis(now())});t.delete(ref);});
    res.json({ok:true,issuanceId:issuance.id,pdfHash:body.pdfHash});return;
   }
   fail(404,'操作が見つかりません。');
  }catch(error){if(error.status)res.status(error.status).json({error:error.message});else{console.error('Receipt API error',{code:error.code});res.status(503).json({error:'処理できませんでした。もう一度お試しください。'});}}
 };
}
module.exports={createHandler};
