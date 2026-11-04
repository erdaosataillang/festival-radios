const API='https://asia-northeast1-urakata-app.cloudfunctions.net/receiptApi';
const REDIRECT='https://app.urakatabu.com/recipt/';
const AUTHORIZE='https://lmc-mobile.sorairosystem.com/receipt-authorize.html';
let auth,fb,profile=null,passkeys=0;
const el=id=>document.getElementById(id);
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));
function lock(message){profile=null;document.body.classList.remove('authenticated');el('auth-status').textContent=message;el('login-receipt').disabled=false;}
async function api(path,body){
 const headers={'Content-Type':'application/json'};if(auth?.currentUser)headers.Authorization='Bearer '+await auth.currentUser.getIdToken();
 const response=await fetch(API+path,{method:body?'POST':'GET',headers,cache:'no-store',body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok){if(response.status===401||response.status===403)lock(result.error);throw Object.assign(new Error(result.error||'処理できませんでした。'),{status:response.status});}return result;
}
async function login(){
 el('login-receipt').disabled=true;el('auth-status').textContent='ログイン画面へ移動します。';
 try{const state=encode(crypto.getRandomValues(new Uint8Array(32))),verifier=encode(crypto.getRandomValues(new Uint8Array(48)));
 const challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 sessionStorage.setItem('receipt-login',JSON.stringify({state,verifier,at:Date.now()}));
 const url=new URL(AUTHORIZE);Object.entries({response_type:'code',client_id:'receipt',redirect_uri:REDIRECT,state,code_challenge:challenge,code_challenge_method:'S256'}).forEach(([key,value])=>url.searchParams.set(key,value));location.assign(url);
 }catch{lock('ログインを開始できませんでした。ブラウザの設定を確認してください。');}
}
function describePasskeys(){el('account-name').textContent=profile?.name||'';el('passkey-state').textContent=passkeys?'登録済み（発行時に本人確認します）':'発行前にパスキーを登録してください。';el('register-passkey').textContent=passkeys?'パスキーを追加':'パスキーを登録';}
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
async function authorizeIssue(blob){
 if(!profile)throw new Error('LMCアカウントでログインしてください。');
 if(!passkeys){document.getElementById('tab-input').click();el('account-settings').open=true;el('account-settings').scrollIntoView({block:'start',behavior:'smooth'});throw new Error('発行前にパスキーを登録してください。');}
 if(!window.PublicKeyCredential)throw new Error('パスキー対応のSafariまたはChromeで開いてください。');
 const pdfHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const {challengeId,options}=await api('/issue/options',{pdfHash});
 const publicKey={...options,challenge:decode(options.challenge),allowCredentials:(options.allowCredentials||[]).map(c=>({...c,id:decode(c.id)}))};
 let credential;try{credential=await navigator.credentials.get({publicKey});}catch(error){throw new Error(error.name==='NotAllowedError'?'本人確認を中止しました。PDFは発行していません。':error.message);}
 if(!credential)throw new Error('本人確認を中止しました。');
 const response={id:credential.id,rawId:encode(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults(),response:{authenticatorData:encode(credential.response.authenticatorData),clientDataJSON:encode(credential.response.clientDataJSON),signature:encode(credential.response.signature),userHandle:credential.response.userHandle?encode(credential.response.userHandle):null}};
 const result=await api('/issue/verify',{challengeId,pdfHash,response});
 if(!result.ok||result.pdfHash!==pdfHash)throw new Error('発行確認に失敗しました。');return result;
}
window.receiptSession={get profile(){return profile},authorizeIssue,login};
el('login-receipt').onclick=login;el('register-passkey').onclick=registerPasskey;
el('logout-receipt').onclick=async()=>{await fb.signOut(auth);location.reload()};
async function start(){
 const {initializeApp}=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js');fb=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js');
 auth=fb.getAuth(initializeApp({apiKey:'AIzaSyAWtITnn5uMOPBgOY0Bd7Rt5IN1ry8XoJI',authDomain:'urakata-app.firebaseapp.com',projectId:'urakata-app',appId:'1:407777765696:web:045c2d94729022b4eab2a5'}));
 await auth.authStateReady();const params=new URLSearchParams(location.search);
 if(params.has('auth_code')){
  let saved;try{saved=JSON.parse(sessionStorage.getItem('receipt-login')||'null')}catch{}
  const code=params.get('auth_code'),state=params.get('state');window.history.replaceState(null,'',location.pathname);sessionStorage.removeItem('receipt-login');
  if(!saved||saved.state!==state||Date.now()-saved.at>600000)throw new Error('ログインの確認に失敗しました。もう一度ログインしてください。');
  const result=await api('/auth/exchange',{code,codeVerifier:saved.verifier,redirectUri:REDIRECT});await fb.signInWithCustomToken(auth,result.customToken);
 }
 if(!auth.currentUser){lock('LMCの登録済みアカウントでログインしてください。');return;}
 const result=await api('/me');profile=result.profile;passkeys=result.passkeys;describePasskeys();document.body.classList.add('authenticated');
 window.dispatchEvent(new Event('receipt-auth-ready'));
 fb.onAuthStateChanged(auth,user=>{if(!user)lock('ログインしてください。')});
 document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&profile){try{const current=await api('/me');passkeys=current.passkeys;describePasskeys();}catch{lock('ログインを確認できません。再度ログインしてください。');}}});
}
start().catch(error=>lock(error.message||'ログインを確認できませんでした。'));

window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
