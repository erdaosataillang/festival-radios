import '../assets/account-header.js?v=lmc-dialog-1';

const apiBase='https://asia-northeast1-urakata-app.cloudfunctions.net/receiptApi';
const hosted=location.origin==='https://urakata-stage-plan.web.app';
const redirect=hosted?'https://urakata-stage-plan.web.app/stage-plan/':'https://app.urakatabu.com/stage-plan/';
const authorize='https://lmc-mobile.sorairosystem.com/stage-authorize.html';
const storageKey='stage-plan-login';
const el=id=>document.getElementById(id);
let auth, sdk, checking=false;
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

export async function api(path,body){
 const headers={};
 if(body)headers['Content-Type']='application/json';
 if(path!=='/auth/exchange'&&auth?.currentUser)headers.Authorization='Bearer '+await auth.currentUser.getIdToken();
 const response=await fetch(apiBase+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(data.error||'サーバーに接続できませんでした。'),{status:response.status});
 return data;
}

function status(message,pending=false,retry=false){
 document.documentElement.classList.toggle('auth-pending',pending);
 el('auth-status').textContent=message;
 el('login-receipt').disabled=pending;
 el('retry-session').hidden=!retry;
}

async function login(){
 if(el('login-receipt').disabled)return;
 status('ログイン画面へ移動しています。',true);
 try{
  const state=encode(crypto.getRandomValues(new Uint8Array(24)));
  const verifier=encode(crypto.getRandomValues(new Uint8Array(48)));
  const challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  sessionStorage.setItem(storageKey,JSON.stringify({state,verifier,at:Date.now(),share:location.hash}));
  const url=new URL(authorize);
  url.search=new URLSearchParams({response_type:'code',client_id:hosted?'stage-hosted':'stage',redirect_uri:redirect,state,code_challenge:challenge,code_challenge_method:'S256'});
  location.assign(url);
 }catch{status('ログインを開始できませんでした。');}
}

export function setupSession(onReady,hasChanges){
 const account=document.querySelector('urakata-account');
 account.setProfile(null,{login});
 el('login-receipt').onclick=login;
 async function check(){
  if(checking)return;
  checking=true;
  status('ログインを確認しています。',true);
  try{
   if(!auth){
    const {initializeApp}=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js');
    sdk=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js');
    auth=sdk.getAuth(initializeApp({apiKey:'AIzaSyAWtITnn5uMOPBgOY0Bd7Rt5IN1ry8XoJI',authDomain:'urakata-app.firebaseapp.com',projectId:'urakata-app',appId:'1:407777765696:web:045c2d94729022b4eab2a5'}));
   }
   await auth.authStateReady();
   const params=new URLSearchParams(location.search);
   if(params.has('auth_code')){
    history.replaceState(null,'',location.pathname);
    const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    sessionStorage.removeItem(storageKey);
    if(!saved||saved.state!==params.get('state')||Date.now()-saved.at>600000)
     throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
    if(/^#share=[a-f0-9]{64}$/.test(saved.share||''))history.replaceState(null,'',location.pathname+saved.share);
    const {customToken}=await api('/auth/exchange',{code:params.get('auth_code'),codeVerifier:saved.verifier,redirectUri:redirect});
    await sdk.signInWithCustomToken(auth,customToken);
   }
   if(!auth.currentUser){status('裏方アカウントでログインしてください。');return;}
   const {profile}=await api('/stage/me');
   account.setProfile(profile,{login,logout:async()=>{
    if(hasChanges()&&!confirm('未保存の変更があります。ログアウトしますか？'))return;
    await sdk.signOut(auth);
    location.reload();
   }});
   document.body.classList.add('authenticated');
   status('ログインしました。');
   onReady(profile);
   sdk.onAuthStateChanged(auth,user=>{if(user?.uid!==profile.id)location.reload();});
  }catch(error){status(error.status?error.message:'ログインを確認できませんでした。通信状況を確認して再試行してください。',false,true);}
  finally{checking=false;}
 }
 el('retry-session').onclick=check;
 check();
}
