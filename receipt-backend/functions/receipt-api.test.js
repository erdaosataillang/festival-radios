const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createHandler}=require('./receipt-api');
const APP='https://app.urakatabu.com',ACCOUNT='https://lmc-mobile.sorairosystem.com';
const hash=x=>createHash('sha256').update(x).digest('base64url');
const sample={recipient:'宛先',honorific:'御中',date:'2026-11-04',amount:'24000',purpose:'費用として',detail:'内訳',number:'20',permanent:'120',note:'',issuer:'テスト発行者',address:'テスト住所',phone:'090-0000-0000',seal:'hide',sealName:'',sealShape:'round',sealFont:'mincho',signatureMode:'unsigned'};
function setup({claims={uid:'user1',line:true,registered:true,auth_time:1000},user={name:'テスト'},verified=true,uv=true,realVerifier=false,issuerProfile={name:sample.issuer,address:sample.address,phone:sample.phone,version:1}}={}){
 let clock=1000000,writes=0;
 const rows=new Map([['users/user1',user],['users/user2',{name:'別のユーザー'}]]);
 if(issuerProfile)rows.set('receiptUsers/user1/settings/issuer',issuerProfile);
 const stamp=milliseconds=>({toMillis:()=>milliseconds});
 const snap=(path)=>({exists:rows.has(path),data:()=>rows.get(path),get:key=>rows.get(path)?.[key],id:path.split('/').pop()});
 const doc=path=>({path,id:path.split('/').pop(),get:async()=>snap(path),create:async value=>{if(rows.has(path))throw Error('exists');rows.set(path,value);writes++;},collection:name=>collection(path+'/'+name)});
 let generated=0;
 const collection=path=>({path,doc:name=>doc(path+'/'+(name||'auto'+(++generated))),limit(){return this},orderBy(){return this},get:async()=>{const docs=[...rows.keys()].filter(key=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).map(snap);return {docs,size:docs.length}}});
 const db={doc,collection,runTransaction:async callback=>{const pending=[];const transaction={get:ref=>ref.get(),create:(ref,value)=>{pending.push(()=>{if(rows.has(ref.path))throw Error('exists');rows.set(ref.path,value);writes++})},delete:ref=>pending.push(()=>{rows.delete(ref.path);writes++}),update:(ref,value)=>pending.push(()=>{rows.set(ref.path,{...rows.get(ref.path),...value});writes++})};const result=await callback(transaction);pending.forEach(f=>f());return result;}};
 const fake={
  generateRegistrationOptions:async options=>{assert.equal(options.rpID,'app.urakatabu.com');assert.equal(options.authenticatorSelection.userVerification,'required');return {challenge:'registration-challenge'}},
  verifyRegistrationResponse:async options=>{assert.equal(options.expectedOrigin,APP);assert.equal(options.requireUserVerification,true);return {verified,registrationInfo:{userVerified:uv,credential:{id:'key1',publicKey:new Uint8Array([1,2,3]),counter:0,transports:['internal']}}}},
  generateAuthenticationOptions:async options=>{assert.equal(options.userVerification,'required');return {challenge:'issue-challenge'}},
  verifyAuthenticationResponse:async options=>{assert.equal(options.requireUserVerification,true);assert.equal(options.expectedRPID,'app.urakatabu.com');assert.equal(options.expectedOrigin,APP);assert.equal(options.expectedChallenge,'issue-challenge');return {verified,authenticationInfo:{userVerified:uv,newCounter:options.credential.counter+1}}}
 };
 const handler=createHandler({auth:{verifyIdToken:async()=>{if(!claims)throw Error('no token');return claims},getUser:async()=>({disabled:false}),createCustomToken:async uid=>'test-token-'+uid},db,Timestamp:{fromMillis:stamp},webauthn:realVerifier?require('@simplewebauthn/server'):fake,now:()=>clock});
 const call=async(path,body,origin=APP)=>{if(path==='/issue/options'&&body)body={receipt:{...sample},issuerVersion:1,...body};const res={code:200,set(){},status(code){this.code=code;return this},json(body){this.body=body},send(){}};await handler({path,method:body?'POST':'GET',body,get:name=>name==='origin'?origin:'Bearer test'},res);return res};
 const key=(uid='user1')=>rows.set('receiptUsers/'+uid+'/credentials/'+hash('key1'),{credentialId:'key1',publicKey:'AQID',counter:0,transports:['internal']});
 return {call,rows,key,setTime:value=>{clock=value},expire:()=>clock+=180000,get writes(){return writes}};
}
test('匿名は機能・発行APIにアクセスできない',async()=>{const s=setup({claims:null});for(const path of ['/me','/issue/options','/issue/verify','/passkeys/register/options'])assert.equal((await s.call(path,path==='/me'?undefined:{})).code,401);assert.equal(s.writes,0)});
test('LINE登録クレームがない・利用停止のアカウントを拒否',async()=>{for(const options of [{claims:{uid:'user1'}},{user:{name:'テスト',disabled:true}},{user:{name:'テスト',receiptAccess:false}}])assert.equal((await setup(options).call('/me')).code,403)});
test('接続元・リダイレクトURLを厳密に制限',async()=>{const s=setup();assert.equal((await s.call('/me',undefined,'https://evil.example')).code,403);assert.equal((await s.call('/auth/code',{clientId:'receipt',redirectUri:'https://evil.example',codeChallenge:'a'.repeat(43),codeChallengeMethod:'S256'},ACCOUNT)).code,400)});
test('PKCEコードは正しいverifierで一度だけ交換可能',async()=>{const s=setup(),verifier='a'.repeat(48);const code=await s.call('/auth/code',{clientId:'receipt',redirectUri:APP+'/recipt/',codeChallenge:hash(verifier),codeChallengeMethod:'S256'},ACCOUNT);assert.equal(code.code,200);const body={code:code.body.code,codeVerifier:verifier,redirectUri:APP+'/recipt/'};assert.equal((await s.call('/auth/exchange',{...body,codeVerifier:'b'.repeat(48)})).code,401);assert.equal((await s.call('/auth/exchange',body)).code,200);assert.equal((await s.call('/auth/exchange',body)).code,401)});
test('パスキー登録には最近のLMCログインが必要',async()=>{assert.equal((await setup({claims:{uid:'user1',line:true,registered:true,auth_time:1}}).call('/passkeys/register/options',{})).code,401)});
test('登録時の本人確認なし応答を拒否',async()=>{const s=setup({uv:false});const r=await s.call('/passkeys/register/options',{});assert.equal((await s.call('/passkeys/register/verify',{challengeId:r.body.challengeId,response:{}})).code,401);assert.equal([...s.rows.keys()].some(k=>k.includes('/credentials/')),false)});
test('パスキー未登録では発行要求を拒否',async()=>{assert.equal((await setup().call('/issue/options',{pdfHash:'a'.repeat(64)})).code,409)});
test('別ユーザーのパスキーを発行に利用できない',async()=>{const s=setup();s.key('user2');const id='a'.repeat(32);s.rows.set('receiptChallenges/'+id,{uid:'user1',kind:'issuance',challenge:'issue-challenge',pdfHash:'a'.repeat(64),expiresAt:{toMillis:()=>2000000}});assert.equal((await s.call('/issue/verify',{challengeId:id,pdfHash:'a'.repeat(64),response:{id:'key1'}})).code,403)});
test('PDF差し替え・期限切れ・同じ認証の再利用を拒否',async()=>{const s=setup();s.key();const r=await s.call('/issue/options',{pdfHash:'a'.repeat(64)});const body={challengeId:r.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1',response:{userHandle:Buffer.from('user1').toString('base64url')}}};assert.equal((await s.call('/issue/verify',{...body,pdfHash:'b'.repeat(64)})).code,400);assert.equal((await s.call('/issue/verify',body)).code,200);assert.equal((await s.call('/issue/verify',body)).code,401);assert.equal([...s.rows.keys()].filter(k=>k.startsWith('receiptIssuances/')).length,1);const expired=await s.call('/issue/options',{pdfHash:'a'.repeat(64),receipt:{...sample,number:'21',permanent:'121'}});s.expire();assert.equal((await s.call('/issue/verify',{...body,challengeId:expired.body.challengeId})).code,401)});
test('userHandleの別アカウント偽装を拒否',async()=>{const s=setup();s.key();const r=await s.call('/issue/options',{pdfHash:'a'.repeat(64)});assert.equal((await s.call('/issue/verify',{challengeId:r.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1',response:{userHandle:Buffer.from('user2').toString('base64url')}}})).code,403)});
test('本人確認なし・署名検証失敗では発行記録を作らない',async()=>{for(const options of [{uv:false},{verified:false}]){const s=setup(options);s.key();const r=await s.call('/issue/options',{pdfHash:'a'.repeat(64)});assert.equal((await s.call('/issue/verify',{challengeId:r.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1'}})).code,401);assert.equal([...s.rows.keys()].some(k=>k.startsWith('receiptIssuances/')),false)}});
test('実検証ライブラリで不正なWebAuthn応答を拒否',async()=>{const s=setup({realVerifier:true});s.key();const id='a'.repeat(32);s.rows.set('receiptChallenges/'+id,{uid:'user1',kind:'issuance',challenge:'issue-challenge',pdfHash:'a'.repeat(64),expiresAt:{toMillis:()=>2000000}});assert.equal((await s.call('/issue/verify',{challengeId:id,pdfHash:'a'.repeat(64),response:{id:'key1',response:{}}})).code,401)});
test('発行者の初回登録・自動取得・更新と競合拒否',async()=>{const s=setup({issuerProfile:null});assert.equal((await s.call('/me')).body.issuer,null);const data={name:'会社名',address:'所在地',phone:'電話'};const created=await s.call('/issuer',{issuer:data,version:null});assert.equal(created.code,200);assert.equal(created.body.issuer.version,1);assert.equal((await s.call('/me')).body.issuer.name,'会社名');assert.equal((await s.call('/issuer',{issuer:{...data,name:'変更後'},version:1})).code,200);assert.equal((await s.call('/issuer',{issuer:{...data,name:'古い画面からの変更'},version:1})).code,409);assert.equal((await s.call('/me')).body.issuer.name,'変更後')});
test('未ログインで発行者や履歴を読み書きできない',async()=>{const s=setup({claims:null});assert.equal((await s.call('/issuer',{issuer:{name:'test'},version:null})).code,401);assert.equal((await s.call('/drafts',{receipt:sample,issuerVersion:1})).code,401);assert.equal((await s.call('/history')).code,401)});
test('登録前には下書き保存も発行もできない',async()=>{const s=setup({issuerProfile:null});s.key();assert.equal((await s.call('/drafts',{receipt:sample,issuerVersion:1})).code,409);assert.equal((await s.call('/issue/options',{pdfHash:'a'.repeat(64)})).code,409)});
test('下書きはFirebaseに保存され同一伝票は更新される',async()=>{const s=setup();assert.equal((await s.call('/drafts',{receipt:{...sample,uid:'user2',issuer:'偽の名前'},issuerVersion:1})).code,200);assert.equal((await s.call('/drafts',{receipt:{...sample,amount:'50000'},issuerVersion:1})).code,200);const records=(await s.call('/history')).body.records;assert.equal(records.length,1);assert.equal(records[0].kind,'draft');assert.equal(records[0].data.amount,50000);assert.equal(records[0].data.issuer,sample.issuer);assert.equal([...s.rows.values()].filter(d=>d.receipt).length,1)});
test('別アカウントから他人の発行者・記録にアクセスできない',async()=>{const s=setup();await s.call('/drafts',{receipt:sample,issuerVersion:1});const other=setup({claims:{uid:'user2',line:true,registered:true,auth_time:1000}});for(const [key,value] of s.rows)other.rows.set(key,value);assert.equal((await other.call('/me')).body.issuer,null);assert.deepEqual((await other.call('/history')).body.records,[]);await other.call('/issuer',{issuer:{name:'別の発行者'},version:null});assert.equal(s.rows.get('receiptUsers/user1/settings/issuer').name,sample.issuer)});
test('発行成功時に記録と監査を同じトランザクションで保存し、過去の発行者を保持',async()=>{const s=setup();s.key();const options=await s.call('/issue/options',{pdfHash:'a'.repeat(64)});const issued=await s.call('/issue/verify',{challengeId:options.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1'},receipt:{recipient:'認証後の差し替え'}});assert.equal(issued.code,200);const history=(await s.call('/history')).body.records;assert.equal(history[0].kind,'issued');assert.equal(history[0].data.recipient,sample.recipient);assert.equal(history[0].data.issuer,sample.issuer);assert.equal(history[0].pdfHash,'a'.repeat(64));assert(s.rows.has('receiptIssuances/'+issued.body.issuanceId));assert(s.rows.has('receiptUsers/user1/receipts/'+issued.body.issuanceId));await s.call('/issuer',{issuer:{name:'新しい発行者'},version:1});assert.equal((await s.call('/history')).body.records[0].data.issuer,sample.issuer)});
test('発行者の変更後は古いPDF・古いプロフィールで発行できない',async()=>{const s=setup();s.key();const options=await s.call('/issue/options',{pdfHash:'a'.repeat(64)});await s.call('/issuer',{issuer:{name:'変更後'},version:1});assert.equal((await s.call('/issue/verify',{challengeId:options.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1'}})).code,409);assert.equal((await s.call('/history')).body.records.length,0)});
test('PDFに登録情報と違う発行者を差し込んだ要求を拒否',async()=>{const s=setup();s.key();assert.equal((await s.call('/issue/options',{pdfHash:'a'.repeat(64),receipt:{...sample,issuer:'別人'}})).code,409);assert.equal((await s.call('/issue/options',{pdfHash:'a'.repeat(64),receipt:null})).code,400)});
const testBank={name:'テスト銀行',branch:'支店',type:'普通',number:'0000001',holder:'テスト'};
const invoiceSample={...sample,number:'100',subject:'作業費',dueDate:'2026-11-30',deliveryDate:'2026-10-31',taxRate:10,items:[{name:'作業費',quantity:'1',unitPrice:59091}],bank:testBank};
const invoiceIssuer={name:sample.issuer,address:sample.address,phone:sample.phone,version:1,bank:testBank};
test('領収書から発行者を変更しても請求書の振込先を消さない',async()=>{const s=setup({issuerProfile:invoiceIssuer});await s.call('/issuer',{issuer:{name:'更新後'},version:1});assert.equal((await s.call('/me')).body.issuer.bank.number,'0000001')});
test('請求書のログインコードを領収書の戻り先に転用できない',async()=>{const s=setup(),verifier='a'.repeat(48);const r=await s.call('/auth/code',{clientId:'invoice',redirectUri:APP+'/invoice/',codeChallenge:hash(verifier),codeChallengeMethod:'S256'},ACCOUNT);assert.equal(r.code,200);assert.equal((await s.call('/auth/exchange',{code:r.body.code,codeVerifier:verifier,redirectUri:APP+'/recipt/'})).code,401);assert.equal((await s.call('/auth/exchange',{code:r.body.code,codeVerifier:verifier,redirectUri:APP+'/invoice/'})).code,200)});
test('請求書と領収書の下書き・発行記録と認証を分離',async()=>{const s=setup({issuerProfile:invoiceIssuer});s.key();assert.equal((await s.call('/invoices/drafts',{receipt:invoiceSample,issuerVersion:1})).code,200);assert.equal((await s.call('/history')).body.records.length,0);assert.equal((await s.call('/invoices/history')).body.records[0].data.total,65000);const r=await s.call('/invoices/issue/options',{pdfHash:'a'.repeat(64),receipt:invoiceSample,issuerVersion:1});assert.equal(r.code,200);const body={challengeId:r.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1'}};assert.equal((await s.call('/issue/verify',body)).code,401);assert.equal((await s.call('/invoices/issue/verify',body)).code,200);const history=(await s.call('/invoices/history')).body.records;assert.equal(history.filter(x=>x.kind==='issued').length,1);assert.equal((await s.call('/history')).body.records.length,0)});
test('請求書の振込先差し替えと匿名アクセスを拒否',async()=>{const s=setup({issuerProfile:invoiceIssuer});s.key();assert.equal((await s.call('/invoices/issue/options',{pdfHash:'a'.repeat(64),receipt:{...invoiceSample,bank:{...testBank,number:'9999999'}},issuerVersion:1})).code,409);const anonymous=setup({claims:null});assert.equal((await anonymous.call('/invoices/history')).code,401);assert.equal((await anonymous.call('/invoices/drafts',{receipt:invoiceSample,issuerVersion:1})).code,401)});
const sealSample={sealName:'確認印',sealShape:'square',sealFont:'gothic'};
test('印鑑を本人の設定に保存し両アプリで取得できる',async()=>{const s=setup();assert.equal((await s.call('/me')).body.seal,null);const r=await s.call('/seal',{seal:{...sealSample,uid:'user2'},version:null});assert.equal(r.code,200);assert.deepEqual(r.body.seal,{...sealSample,version:1,updatedAt:1000000});assert.deepEqual((await s.call('/me')).body.seal,r.body.seal);assert.deepEqual((await s.call('/seal')).body.seal,r.body.seal);assert(s.rows.has('receiptUsers/user1/settings/seal'));assert(!s.rows.has('receiptUsers/user2/settings/seal'));});
test('別アカウントの印鑑と匿名アクセスを拒否する',async()=>{const s=setup();s.rows.set('receiptUsers/user2/settings/seal',{...sealSample,version:5});assert.equal((await s.call('/seal')).body.seal,null);assert.equal((await s.call('/seal',{seal:sealSample,version:5})).code,409);assert.equal(s.rows.get('receiptUsers/user2/settings/seal').version,5);const a=setup({claims:null});assert.equal((await a.call('/seal')).code,401);assert.equal((await a.call('/seal',{seal:sealSample,version:null})).code,401);assert.equal(a.writes,0)});
test('印鑑の不正入力・更新競合を拒否し、過去の発行記録を保持する',async()=>{const s=setup();for(const seal of [{...sealSample,sealName:''},{...sealSample,sealName:'長すぎる印鑑の文字列'},{...sealSample,sealShape:'bad'},{...sealSample,sealFont:'bad'}])assert.equal((await s.call('/seal',{seal,version:null})).code,400);assert.equal(s.writes,0);await s.call('/seal',{seal:sealSample,version:null});assert.equal((await s.call('/seal',{seal:{...sealSample,sealName:'上書き'},version:null})).code,409);s.key();const r=await s.call('/issue/options',{pdfHash:'a'.repeat(64),receipt:{...sample,seal:'generated',...sealSample}});await s.call('/issue/verify',{challengeId:r.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1'}});assert.equal((await s.call('/seal',{seal:{...sealSample,sealName:'変更後'},version:1})).code,200);assert.equal((await s.call('/history')).body.records[0].data.sealName,sealSample.sealName)});

test('発行記録へのリンクは発行アカウントの帳票だけを返す', async () => {
 const id = 'a'.repeat(20);
 const own = setup();
 own.rows.set('receiptUsers/user1/receipts/'+id, {receipt:sample});
 own.rows.set('receiptUsers/user2/invoices/'+id, {receipt:{recipient:'別ユーザー'}});
 assert.deepEqual((await own.call('/issued/'+id)).body, {document:sample});
 assert.equal((await own.call('/invoices/issued/'+id)).code, 404);
 assert.equal((await setup({claims:null}).call('/issued/'+id)).code, 401);
});

test('請求書番号は100から始まり、発行が成立したときだけ進む',async()=>{
 const s=setup({issuerProfile:invoiceIssuer});s.key();
 assert.deepEqual((await s.call('/invoices/next-number')).body,{number:'100'});
 const body={receipt:invoiceSample,issuerVersion:1,pdfHash:'a'.repeat(64)};
 assert.equal((await s.call('/invoices/issue/options',{...body,receipt:{...invoiceSample,number:'999'}})).code,409);
 const a=await s.call('/invoices/issue/options',body);
 const b=await s.call('/invoices/issue/options',body);
 assert.deepEqual((await s.call('/invoices/next-number')).body,{number:'100'});
 const verify=r=>s.call('/invoices/issue/verify',{challengeId:r.body.challengeId,pdfHash:body.pdfHash,response:{id:'key1'}});
 assert.equal((await verify(a)).code,200);
 assert.equal((await verify(b)).code,409);
 assert.deepEqual((await s.call('/invoices/next-number')).body,{number:'101'});
});

test('登録済みの印鑑を引き継ぎ、別名の印鑑を追加できる',async()=>{
 const s=setup();
 await s.call('/seal',{seal:sealSample,version:null});
 const r=await s.call('/seals',{name:'取引用',seal:{...sealSample,sealShape:'round'}});
 assert.equal(r.code,200);
 assert.deepEqual(r.body.seals.map(x=>x.name),[sealSample.sealName,'取引用']);
 assert.deepEqual((await s.call('/me')).body.seal.seals,r.body.seals);
 assert.equal((await s.call('/seals',{name:'取引用',seal:sealSample})).code,409);
 assert.equal((await setup({claims:null}).call('/seals',{name:'取引用',seal:sealSample})).code,401);
});

test('伝票は日本時間の年ごとに20から、永久伝票は120から通算する',async()=>{
 const s=setup();s.key();
 s.setTime(Date.parse('2026-12-31T14:59:00Z'));
 const numbers=async()=>(await s.call('/next-number')).body;
 const prepare=receipt=>s.call('/issue/options',{pdfHash:'a'.repeat(64),receipt:{...sample,...receipt}});
 const verify=prepared=>s.call('/issue/verify',{challengeId:prepared.body.challengeId,pdfHash:'a'.repeat(64),response:{id:'key1'}});
 assert.deepEqual(await numbers(),{number:'20',permanent:'120'});
 assert.equal((await prepare({number:'99'})).code,409);
 assert.equal((await verify(await prepare(await numbers()))).code,200);
 assert.deepEqual(await numbers(),{number:'21',permanent:'121'});
 const old=await prepare(await numbers());
 s.setTime(Date.parse('2026-12-31T15:00:00Z'));
 assert.equal((await verify(old)).code,409);
 assert.deepEqual(await numbers(),{number:'20',permanent:'121'});
 assert.equal((await verify(await prepare(await numbers()))).code,200);
 assert.deepEqual(await numbers(),{number:'21',permanent:'122'});
});

test('ステージ図面の更新は本人の図面に限定し、競合時に上書きしない',async()=>{
 const s=setup(),id='p'.repeat(20);
 const plan={title:'ステージ確認',items:[{id:'550e8400-e29b-41d4-a716-446655440000',kind:'light',name:'照明A',x:500,y:100,angle:90,height:4}]};
 assert.equal((await s.call('/stage/plans',{plan})).code,200);
 s.rows.set('stagePlanUsers/user1/plans/'+id,{...plan,version:1,updatedAt:{toMillis:()=>1000}});
 assert.deepEqual((await s.call('/stage/plans/'+id)).body,{...plan,id,version:1});
 const updated={...plan,title:'照明図'};
 assert.equal((await s.call('/stage/plans/'+id,{plan:updated,version:1})).body.version,2);
 assert.equal((await s.call('/stage/plans/'+id,{plan,version:1})).code,409);
 assert.equal((await s.call('/stage/plans/'+id)).body.title,'照明図');
 s.rows.set('stagePlanUsers/user2/plans/'+'q'.repeat(20),{...plan,version:1});
 assert.equal((await s.call('/stage/plans/'+'q'.repeat(20))).code,404);
 assert.equal((await s.call('/stage/plans')).body.plans.length,2);
 assert.equal((await setup({claims:null}).call('/stage/plans')).code,401);
 assert.equal((await setup({user:{name:'確認',stagePlanAccess:false}}).call('/stage/plans')).code,403);
});

test('図面の共有リンクは閲覧・編集を分け、所有者が無効化できる',async()=>{
 const claims={uid:'user1',line:true,registered:true,auth_time:1000};
 const s=setup({claims}),id='s'.repeat(20),own='/stage/plans/'+id;
 const plan={title:'共有図面',items:[]};
 s.rows.set('stagePlanUsers/user1/plans/'+id,{...plan,version:1});
 const view=(await s.call(own+'/links',{role:'view',action:'create'})).body.links.view;
 const edit=(await s.call(own+'/links',{role:'edit',action:'create'})).body.links.edit;
 assert.match(view,/^[a-f0-9]{64}$/);
 assert.notEqual(edit,view);
 claims.uid='user2';
 const shared=token=>'/stage/shared/'+token;
 assert.equal((await s.call(own+'/links')).code,404);
 assert.equal((await s.call(shared(view))).body.access,'view');
 assert.equal((await s.call(shared(view),{plan,version:1})).code,403);
 assert.equal((await s.call(shared(edit),{plan:{...plan,title:'共同編集済み'},version:1})).body.version,2);
 assert.equal((await s.call(shared(edit),{plan,version:1})).code,409);
 assert.equal((await s.call(shared(view))).body.title,'共同編集済み');
 claims.uid='user1';
 assert.equal((await s.call(own+'/links',{role:'edit',action:'revoke'})).code,200);
 claims.uid='user2';
 assert.equal((await s.call(shared(edit))).code,404);
 assert.equal((await s.call(shared(view))).code,200);
});
