import {test} from 'node:test';import assert from 'node:assert/strict';import {parseCSV,importCSV,readCSVFile} from '../festival-radios/csv.mjs';
const header='No.,管理番号,セクション,所属,名前,Ch.,備考\r\n';
test('Excelの見出し前の表題・結合セル由来の空列を許可',()=>{const result=importCSV('\uFEFF,無線機チャンネルプラン,,,,,,,\r\n,Event:,Planned By:,,,,,,\r\n,No.,管理番号,セクション,所属,名前,Ch.,備考,,,\r\n,1,A-101,本部,実行委員,担当者,10,備考,,,\r\n,2,A-102,,,,,,,');assert.equal(result.errors.length,0);assert.equal(result.records[0].id,'A-101');assert.equal(result.records[1].department,'');assert.equal(result.records[1].channel,'');});
test('引用符、カンマ、複数行の備考',()=>{const r=importCSV(header+'1,A-101,本部,実行委員,担当者,10,"予備,電池\n""確認済"""');assert.equal(r.records[0].note,'予備,電池\n"確認済"');});
test('重複・不正な番号・文字数をエラー表示',()=>{const r=importCSV(header+'1,A-101,,,,,\n2,a-101,,,,,\n3,../bad,,,,,');assert.equal(r.errors.length,2);assert.equal(r.errors[0].row,3);});
test('全角の管理番号・チャンネルを半角に正規化',()=>{const r=importCSV(header+'１,Ａ－１０１,本部,,,１０,');assert.equal(r.records[0].id,'A-101');assert.equal(r.records[0].channel,'10');assert.equal(r.errors.length,0);});
test('見出し不足・重複・未完の引用符・200台超を拒否',()=>{assert.throws(()=>importCSV('管理番号\nA-101'));assert.throws(()=>importCSV(header.replace('備考','管理番号')+'1,A-101,,,,,'));assert.throws(()=>parseCSV('"unclosed'));assert.throws(()=>importCSV(header+Array.from({length:201},(_,i)=>`${i+1},A-${i+1},,,,,`).join('\n')));});

test("Shift_JISのCSVファイルを日本語のまま読み取る",async()=>{const bytes=Uint8Array.from(Buffer.from("Tm8uLIrHl52U1I2GLINag06DVoOHg5Msj4qRriyWvJFPLENoLiyU9Y1sDQoxLEEtMTAxLJZ7lZQsLCwxMCyXXJT1DQo=","base64"));const file={size:bytes.length,arrayBuffer:async()=>bytes.buffer};const r=importCSV(await readCSVFile(file));assert.equal(r.records[0].department,"本部");assert.equal(r.records[0].note,"予備");});
