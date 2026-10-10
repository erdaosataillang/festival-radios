'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {profile,validate,validId}=require('./radio-validation');
test('停止・未登録・利用停止アカウントを拒否',()=>{assert.equal(profile('u',{name:'名前',disabled:true}),null);assert.equal(profile('u',{name:'名前',active:false}),null);assert.equal(profile('u',{name:'名前',radioAccess:false}),null);assert.equal(profile('u',{}),null);assert.deepEqual(profile('u',{name:' 名前 '}),{id:'u',name:'名前'});});
test('管理番号のパス逸脱を拒否',()=>{assert.ok(validId('A-101'));for(const id of ['../users','a-1','A/101','', 'A'.repeat(31)])assert.equal(validId(id),false);});
test('状態と長さと必須項目を検証',()=>{const value={department:'本部',channel:'10',assignee:'',status:'保管中',note:''};assert.deepEqual(validate(value),value);assert.throws(()=>validate({...value,department:' '}));assert.throws(()=>validate({...value,status:'紛失'}));assert.throws(()=>validate({...value,note:'a'.repeat(1001)}));assert.throws(()=>validate({...value,channel:10}));});
