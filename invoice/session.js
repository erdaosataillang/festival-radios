const API='https://asia-northeast1-urakata-app.cloudfunctions.net/receiptApi';
const REDIRECT='https://app.urakatabu.com/invoice/';
const AUTHORIZE='https://lmc-mobile.sorairosystem.com/invoice-authorize.html';
let pendingLoginToken;
let auth,fb,profile=null,passkeys=0,issuer=null,savedSeal=null;
const el=id=>document.getElementById(id);
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));
function showAuthStatus(message, pending = false, retry = false) {
 document.documentElement.classList.toggle('auth-pending', pending);
 el('auth-status').textContent = message;
 el('login-receipt').disabled = pending;
 el('retry-session').hidden = !retry;
}
function lock(message){profile=null;issuer=null;savedSeal=null;if(el('issuer-dialog')?.open)el('issuer-dialog').close();document.body.classList.remove('authenticated');showAuthStatus(message);}
async function api(path,body){
 const headers={'Content-Type':'application/json'};if(path!=='/auth/exchange'&&auth?.currentUser)headers.Authorization='Bearer '+await auth.currentUser.getIdToken();
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 12000);
 try {
  const response = await fetch(API + path, {
   method: body ? 'POST' : 'GET', headers, cache: 'no-store',
   body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
   throw Object.assign(new Error(result.error || 'サーバーへの接続に失敗しました。'), {status: response.status});
  }
  return result;
 } catch (error) {
  if (error.status) throw error;
  throw new Error('サーバーに接続できません。通信状況を確認して再試行してください。');
 } finally {
  clearTimeout(timeout);
 }
}
async function login(){
 pendingLoginToken = undefined;
 showAuthStatus('ログイン画面へ移動しています。', true);
 try{const state=encode(crypto.getRandomValues(new Uint8Array(32))),verifier=encode(crypto.getRandomValues(new Uint8Array(48)));
 const challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 sessionStorage.setItem('invoice-login',JSON.stringify({state,verifier,at:Date.now()}));
 const url=new URL(AUTHORIZE);Object.entries({response_type:'code',client_id:'invoice',redirect_uri:REDIRECT,state,code_challenge:challenge,code_challenge_method:'S256'}).forEach(([key,value])=>url.searchParams.set(key,value));location.assign(url);
 }catch{lock('ログインを開始できませんでした。ブラウザの設定を確認してください。');}
}
function describePasskeys(){el('account-name').textContent=profile?.name||'';el('passkey-state').textContent=passkeys?'登録済み（発行時に本人確認します）':'発行前にパスキーを登録してください。';el('register-passkey').textContent=passkeys?'パスキーを追加':'パスキーを登録';}
function applyIssuer(){
 if(!issuer)return;
 el('issuer').value=issuer.name;el('address').value=issuer.address;el('phone').value=issuer.phone;
 el('issuer-summary').textContent='登録済みの発行者・振込先を自動入力しています。';
 window.render();
}
function applySavedSeal(){
 if(!savedSeal)return;
 for(const key of ['sealName','sealShape','sealFont'])el(key).value=savedSeal[key];
 el('seal').value='generated';window.render();
}
async function saveAccountSeal(){
 const button=el('save-account-seal');button.disabled=true;el('seal-status').textContent='サーバーに保存中…';
 try{const seal=Object.fromEntries(['sealName','sealShape','sealFont'].map(key=>[key,el(key).value]));const result=await api('/seal',{seal,version:savedSeal?.version??null});savedSeal=result.seal;applySavedSeal();el('seal-status').textContent='印鑑をアカウントに保存しました。';}
 catch(error){el('seal-status').textContent=error.message;}finally{button.disabled=false;}
}
async function loadAccountSeal(){
 const button=el('load-account-seal');button.disabled=true;
 try{const result=await api('/seal');savedSeal=result.seal;if(savedSeal){applySavedSeal();el('seal-status').textContent='保存した印鑑を読み込みました。';}else el('seal-status').textContent='保存した印鑑はありません。';}
 catch(error){el('seal-status').textContent=error.message;}finally{button.disabled=false;}
}
el('save-account-seal').onclick=saveAccountSeal;el('load-account-seal').onclick=loadAccountSeal;
function editIssuer(){
 el('profileIssuerName').value=issuer?.name||profile?.name||'';
 el('profileIssuerAddress').value=issuer?.address||'';el('profileIssuerPhone').value=issuer?.phone||'';for(const key of ['name','branch','type','number','holder'])el('bank-'+key).value=issuer?.bank?.[key]||(key==='type'?'普通':'');
 el('bank-branch-code').value = issuer?.bank?.branch?.match(/[（(](\d{3})[）)]$/)?.[1] || '';
 el('bank-lookup-status').textContent = '';
 el('issuer-dialog-status').textContent='';el('issuer-dialog-close').hidden=!issuer?.bank?.number;el('issuer-dialog-logout').hidden=Boolean(issuer?.bank?.number);
 if(!el('issuer-dialog').open)el('issuer-dialog').showModal();
}
async function refreshHistory(){
 const result=await api('/invoices/history');window.dispatchEvent(new CustomEvent('receipt-cloud-history',{detail:result.records}));return result.records;
}
async function saveDraft(receipt){
 if(!issuer?.bank?.number){editIssuer();throw new Error('先に発行者・振込先を登録してください。');}
 return api('/invoices/drafts',{receipt,issuerVersion:issuer.version});
}
el('issuer-profile-form').onsubmit=async event=>{
 event.preventDefault();const button=el('issuer-dialog-save');button.disabled=true;el('issuer-dialog-status').textContent='保存中…';
 try{const result=await api('/issuer',{issuer:{name:el('profileIssuerName').value,address:el('profileIssuerAddress').value,phone:el('profileIssuerPhone').value,bank:Object.fromEntries(['name','branch','type','number','holder'].map(key=>[key,el('bank-'+key).value]))},version:issuer?.version??null});issuer=result.issuer;applyIssuer();el('issuer-dialog').close();}
 catch(error){el('issuer-dialog-status').textContent=error.message;}finally{button.disabled=false;}
};
el('issuer-dialog').addEventListener('cancel',event=>{if(!issuer?.bank?.number)event.preventDefault()});
el('edit-issuer').onclick=editIssuer;el('issuer-dialog-close').onclick=()=>el('issuer-dialog').close();
el('issuer-dialog-logout').onclick=async()=>{await fb.signOut(auth);location.reload()};
async function registerPasskey(){
 if(!window.PublicKeyCredential){el('passkey-state').textContent='このブラウザはパスキーに対応していません。SafariまたはChromeで開いてください。';return;}
 const button=el('register-passkey');button.disabled=true;
 try{
  const {challengeId,options}=await api('/passkeys/register/options',{});
  const publicKey={...options,challenge:decode(options.challenge),user:{...options.user,id:decode(options.user.id)},excludeCredentials:(options.excludeCredentials||[]).map(c=>({...c,id:decode(c.id)}))};
  const credential=await navigator.credentials.create({publicKey});if(!credential)throw new Error('登録を中止しました。');
  const response={id:credential.id,rawId:encode(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults(),response:{attestationObject:encode(credential.response.attestationObject),clientDataJSON:encode(credential.response.clientDataJSON),transports:credential.response.getTransports?.()||[]}};
  await api('/passkeys/register/verify',{challengeId,response});passkeys++;describePasskeys();
 }catch(error){el('passkey-state').textContent=error.name==='NotAllowedError'?'パスキーの登録を中止しました。':error.message;}finally{button.disabled=false;}
}
async function authorizeIssue(blob,receipt){
 if(!profile)throw new Error('裏方アカウントでログインしてください。');
 if(!issuer?.bank?.number){editIssuer();throw new Error('先に発行者・振込先を登録してください。');}
 if(!passkeys){document.getElementById('tab-input').click();el('account-settings').open=true;el('account-settings').scrollIntoView({block:'start',behavior:'smooth'});throw new Error('発行前にパスキーを登録してください。');}
 if(!window.PublicKeyCredential)throw new Error('パスキー対応のSafariまたはChromeで開いてください。');
 const pdfHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const {challengeId,options}=await api('/invoices/issue/options',{pdfHash,receipt,issuerVersion:issuer.version});
 const publicKey={...options,challenge:decode(options.challenge),allowCredentials:(options.allowCredentials||[]).map(c=>({...c,id:decode(c.id)}))};
 let credential;try{credential=await navigator.credentials.get({publicKey});}catch(error){throw new Error(error.name==='NotAllowedError'?'本人確認を中止しました。PDFは発行していません。':error.message);}
 if(!credential)throw new Error('本人確認を中止しました。');
 const response={id:credential.id,rawId:encode(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults(),response:{authenticatorData:encode(credential.response.authenticatorData),clientDataJSON:encode(credential.response.clientDataJSON),signature:encode(credential.response.signature),userHandle:credential.response.userHandle?encode(credential.response.userHandle):null}};
 const result=await api('/invoices/issue/verify',{challengeId,pdfHash,response});
 if(!result.ok||result.pdfHash!==pdfHash)throw new Error('発行確認に失敗しました。');
 refreshHistory().catch(()=>{});return result;
}
window.receiptSession={get profile(){return profile},get issuer(){return issuer},authorizeIssue,login,saveDraft,refreshHistory,editIssuer,applyIssuer};
el('login-receipt').onclick=login;el('register-passkey').onclick=registerPasskey;
el('logout-receipt').onclick=async()=>{await fb.signOut(auth);location.reload()};
async function start(){
 showAuthStatus('ログインを確認しています。', true);
 if (!auth) {
 const {initializeApp}=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js');fb=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js');
 auth=fb.getAuth(initializeApp({apiKey:'AIzaSyAWtITnn5uMOPBgOY0Bd7Rt5IN1ry8XoJI',authDomain:'urakata-app.firebaseapp.com',projectId:'urakata-app',appId:'1:407777765696:web:045c2d94729022b4eab2a5'}));
 }
 await auth.authStateReady();const params=new URLSearchParams(location.search);
 if(params.has('auth_code')){
  let saved;try{saved=JSON.parse(sessionStorage.getItem('invoice-login')||'null')}catch{}
  const code=params.get('auth_code'),state=params.get('state');window.history.replaceState(null,'',location.pathname);sessionStorage.removeItem('invoice-login');
  if(!saved||saved.state!==state||Date.now()-saved.at>600000)throw Object.assign(new Error('ログインの有効期限が切れました。もう一度ログインしてください。'),{status:400});
  const result=await api('/auth/exchange',{code,codeVerifier:saved.verifier,redirectUri:REDIRECT});pendingLoginToken=result.customToken;
 }
 if (pendingLoginToken) {
  try {
   await fb.signInWithCustomToken(auth, pendingLoginToken);
  } catch (error) {
   if (error.code === 'auth/network-request-failed') throw error;
   pendingLoginToken = undefined;
   throw Object.assign(new Error('ログインをやり直してください。'), {status:401});
  }
  pendingLoginToken = undefined;
 }
 if(!auth.currentUser){lock('登録済みの裏方アカウントでログインしてください。');return;}
 const result=await api('/me');profile=result.profile;passkeys=result.passkeys;issuer=result.issuer;savedSeal=result.seal;applySavedSeal();describePasskeys();showAuthStatus('ログインしました。');document.body.classList.add('authenticated');
 if(issuer)applyIssuer();if(!issuer?.bank?.number)editIssuer();
 window.dispatchEvent(new Event('receipt-auth-ready'));
 refreshHistory().catch(()=>{el('cloud-history-status').textContent='履歴を読み込めませんでした。「再読み込み」を押してください。'});
 observeSession();
}

let observingSession = false;
let checkingSession = false;
function observeSession() {
 if (observingSession) return;
 observingSession = true;
 fb.onAuthStateChanged(auth, user => {
  if (!user) lock('裏方アカウントでログインしてください。');
  else if (profile && user.uid !== profile.id) location.reload();
 });
 document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshSession();
 });
}

async function refreshSession() {
 if (!profile || checkingSession) return;
 checkingSession = true;
 const accountId = profile.id;
 try {
  const current = await api('/me');
  if (profile?.id !== accountId) return;
  if (current.profile.id !== accountId) {
   location.reload();
   return;
  }
  passkeys = current.passkeys;
  describePasskeys();
  if (current.issuer?.version !== issuer?.version) {
   issuer = current.issuer;
   if (issuer) applyIssuer();
  }
 } catch (error) {
  if (profile?.id === accountId && [401, 403].includes(error.status)) lock(error.message);
 } finally {
  checkingSession = false;
 }
}

function checkLogin() {
 start().catch(error => {
  const message = [400, 401, 403].includes(error.status)
   ? error.message : 'ログインを確認できませんでした。通信状況を確認して再試行してください。';
  lock(message);
  showAuthStatus(message, false, ![400, 401, 403].includes(error.status));
 });
}

el('retry-session').onclick = checkLogin;
window.addEventListener('pageshow', event => {
 if (event.persisted) {
  if (profile) refreshSession();
  else if (!el('login-receipt').disabled) checkLogin();
 }
});
checkLogin();
