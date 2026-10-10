'use strict';
const {initializeApp}=require('firebase-admin/app');
initializeApp();
const {onRequest}=require('firebase-functions/v2/https');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,Timestamp,FieldValue}=require('firebase-admin/firestore');
const {randomBytes}=require('node:crypto');
const {safeEqual,sha256Base64Url,validPkceChallenge,validPkceVerifier}=require('./pkce');
const {fail,validId,profile,validate,publicRadio}=require('./radio-validation');
const REDIRECT='https://erdaosataillang.github.io/festival-radios/';
const ACCOUNT_ORIGIN='https://lmc-mobile.sorairosystem.com';
const redirects=new Set([REDIRECT,'https://lmc-festival-radios.brisk-puppy-2157.chatgpt.site/']);
const allowed=new Set([ACCOUNT_ORIGIN,...[...redirects].map(u=>new URL(u).origin),'http://localhost:5173','http://127.0.0.1:5173']);
async function identity(req){let claims;try{claims=await getAuth().verifyIdToken((req.get('authorization')||'').replace(/^Bearer\s+/i,''),true);}catch{fail(401,'アカウントでログインしてください。');}if(claims.line!==true||claims.registered!==true)fail(403,'登録アカウントが必要です。');const s=await getFirestore().doc(`users/${claims.uid}`).get();const p=s.exists?profile(claims.uid,s.data()):null;if(!p)fail(403,'このアカウントは利用できません。');return p;}
exports.festivalRadioApi=onRequest({region:'asia-northeast1',memory:'256MiB',timeoutSeconds:30,maxInstances:10},async(req,res)=>{
 const origin=req.get('origin');res.set('Cache-Control','no-store');if(allowed.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}res.set('Access-Control-Allow-Headers','Content-Type, Authorization');res.set('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
 if(req.method==='OPTIONS'){res.status(allowed.has(origin)?204:403).send('');return;}if(origin&&!allowed.has(origin)){res.status(403).json({error:'許可されていない接続元です。'});return;}
 const db=getFirestore(),body=req.body||{};
 try{
  if(req.method==='POST'&&req.path==='/auth/code'){
   if(origin!==ACCOUNT_ORIGIN||body.clientId!=='festival-radio'||!redirects.has(body.redirectUri)||body.codeChallengeMethod!=='S256'||!validPkceChallenge(body.codeChallenge))fail(400,'認証要求が正しくありません。');
   const p=await identity(req),code=randomBytes(32).toString('base64url');await db.doc(`radioAuthorizationCodes/${sha256Base64Url(code)}`).create({uid:p.id,redirectUri:body.redirectUri,codeChallenge:body.codeChallenge,expiresAt:Timestamp.fromMillis(Date.now()+60000)});res.json({code});return;
  }
  if(req.method==='POST'&&req.path==='/auth/exchange'){
   if(typeof body.code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.code)||!validPkceVerifier(body.codeVerifier)||!redirects.has(body.redirectUri))fail(400,'認証情報が正しくありません。');
   const ref=db.doc(`radioAuthorizationCodes/${sha256Base64Url(body.code)}`);const uid=await db.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists||s.get('redirectUri')!==body.redirectUri||!s.get('expiresAt')||s.get('expiresAt').toMillis()<=Date.now()||!safeEqual(sha256Base64Url(body.codeVerifier),s.get('codeChallenge')))fail(401,'ログインの有効期限が切れました。再度ログインしてください。');t.delete(ref);return s.get('uid');});const s=await db.doc(`users/${uid}`).get();if(!s.exists||!profile(uid,s.data()))fail(403,'利用可能なアカウントがありません。');res.json({customToken:await getAuth().createCustomToken(uid,{line:true,registered:true})});return;
  }
  // 公開読み取りはユーザー情報コレクションと分離する。
  if(req.method==='GET'&&req.path==='/radios'){const s=await db.collection('festivalRadios').orderBy('__name__').limit(1000).get();res.json({radios:s.docs.map(publicRadio)});return;}
  const match=req.path.match(/^\/radios\/([A-Z0-9][A-Z0-9_-]{0,29})$/);
  if(match&&req.method==='GET'){const s=await db.doc(`festivalRadios/${match[1]}`).get();if(!s.exists)fail(404,'機器が見つかりません。');res.json({radio:publicRadio(s)});return;}
  const p=await identity(req);
  if(req.method==='GET'&&req.path==='/me'){res.json({profile:p});return;}
  if(match&&['POST','PATCH'].includes(req.method)){
   if(!validId(match[1])||body.id!==match[1])fail(400,'管理番号を確認してください。');const data=validate(body),ref=db.doc(`festivalRadios/${match[1]}`),event=ref.collection('history').doc();
   await db.runTransaction(async t=>{const s=await t.get(ref);if(req.method==='POST'&&s.exists)fail(409,'この管理番号は登録済みです。');if(req.method==='PATCH'&&!s.exists)fail(404,'機器が見つかりません。');if(req.method==='PATCH'&&(!Number.isInteger(body.version)||s.get('version')!==body.version))fail(409,'他の人が更新しています。画面を再読み込みしてから編集してください。');const version=s.exists?s.get('version')+1:1;const updatedAt=FieldValue.serverTimestamp();t.set(ref,{...data,version,updatedAt});t.create(event,{...data,version,actorId:p.id,actorName:p.name,updatedAt});});res.status(req.method==='POST'?201:200).json({ok:true});return;
  }
  fail(404,'操作が見つかりません。');
 }catch(e){if(e.status)res.status(e.status).json({error:e.message});else{console.error('Radio API error',{code:e.code});res.status(503).json({error:'保存または読み込みに失敗しました。もう一度お試しください。'});}}
});
