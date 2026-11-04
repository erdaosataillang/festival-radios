(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.invoiceMath=factory()})(globalThis,function(){
 function calculate(items,taxRate){
  if(!Array.isArray(items)||!items.length||items.length>25)throw Error('明細は1〜25行で入力してください。');
  if(![0,8,10].includes(Number(taxRate)))throw Error('税率を確認してください。');
  let subtotal=0n;
  const lines=items.map(item=>{
   const quantity=String(item.quantity).trim();if(!/^\d{1,6}(?:\.\d{1,3})?$/.test(quantity))throw Error('数量は小数点以下3桁までで入力してください。');
   const [whole,fraction='']=quantity.split('.'),milli=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));if(milli<=0n)throw Error('数量は0より大きい数値を入力してください。');
   const price=Number(item.unitPrice);if(!Number.isSafeInteger(price)||price<0||price>999999999)throw Error('単価は0〜999,999,999円で入力してください。');
   const amount=milli*BigInt(price)/1000n;subtotal+=amount;if(subtotal>999999999999n)throw Error('請求額が上限を超えています。');
   return {name:String(item.name||''),quantity,unitPrice:price,amount:Number(amount)};
  });
  const tax=subtotal*BigInt(Number(taxRate))/100n,total=subtotal+tax;if(total>999999999999n)throw Error('請求額が上限を超えています。');
  return {items:lines,subtotal:Number(subtotal),tax:Number(tax),total:Number(total),taxRate:Number(taxRate)};
 }
 return {calculate};
});
