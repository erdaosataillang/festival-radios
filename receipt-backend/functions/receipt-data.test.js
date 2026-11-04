const {test}=require('node:test'),assert=require('node:assert/strict');
const {issuer,receipt}=require('./receipt-data');
const registered={name:'登録済み発行者',address:'住所',phone:'電話',version:2};
const base={recipient:'宛先',honorific:'御中',date:'2026-11-04',amount:'24000',purpose:'機材費',number:'10',seal:'hide',sealName:'',sealShape:'round',sealFont:'mincho',signatureMode:'unsigned'};
test('発行者名を必須とし文字数を検証する',()=>{assert.throws(()=>issuer({name:''}));assert.throws(()=>issuer({name:'a'.repeat(101)}));assert.deepEqual(issuer({name:' 発行者 ',address:' 住所 ',phone:''}),{name:'発行者',address:'住所',phone:''})});
test('登録済み発行者を必須とし更新競合を拒否',()=>{assert.throws(()=>receipt(base,null,2),e=>e.status===409);assert.throws(()=>receipt(base,registered,1),e=>e.status===409)});
test('金額・日付・必須項目・設定値を検証',()=>{for(const changes of [{amount:0},{amount:'nan'},{amount:1.2},{date:'2026-02-30'},{recipient:''},{purpose:''},{seal:'generated',sealName:''},{honorific:'<script>'}])assert.throws(()=>receipt({...base,...changes},registered,2))});
test('クライアントが発行者を偽装しても登録値からスナップショットを作る',()=>{const result=receipt({...base,issuer:'偽の名',address:'偽の住所',phone:'偽の電話',uid:'other-user'},registered,2);assert.equal(result.issuer,registered.name);assert.equal(result.address,registered.address);assert.equal(result.phone,registered.phone);assert.equal(result.issuerVersion,2);assert.equal(result.amount,24000);assert.equal(result.uid,undefined)});
