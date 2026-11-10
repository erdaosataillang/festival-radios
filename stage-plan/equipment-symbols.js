const box=(x,y,width,height,rx=3)=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}"/>`;
const circle=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}"/>`;
const white=shape=>`<g fill="#fff">${shape}</g>`;
const shapes={
 sus:box(-45,-4,90,8,0)+white([-40,-20,0,20,40].map(x=>circle(x,0,1.5)).join('')),
 baton:'<path d="M-45 0H45" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 3"/>'+circle(-44,0,2)+circle(44,0,2),
 cabinet:box(-16,-24,32,48)+white(circle(0,6,9)+circle(0,-12,4))+'<path d="M-7 26H7L0 34z"/>',
 wedge:'<path d="M-23 16l9-32h28l9 32z"/>'+white(box(-12,-4,24,9))+'<path d="M-6 20H6L0 27z"/>',
 sub:box(-24,-18,48,36)+white(circle(0,0,11))+circle(0,0,6),
 dual:box(-35,-18,70,36)+white(circle(-17,0,11)+circle(17,0,11)),
 array:[-21,-7,7,21].map((y,i)=>box(-18+i,y,36-i*2,11,2)).join(''),
 column:box(-8,-30,16,60)+white([-20,-10,0,10,20].map(y=>circle(0,y,3)).join('')),
 fill:box(-30,-12,60,24)+white(circle(-13,0,6)+circle(13,0,6)),
 drums:circle(0,4,16)+circle(-16,-13,9)+circle(14,-13,9)+circle(-28,12,9)+circle(28,12,9)+white(circle(0,4,10)),
 drum:circle(0,0,22)+white(circle(0,0,16))+circle(0,0,3),
 mallet:box(-31,-16,62,32)+white([-24,-16,-8,0,8,16,24].map(x=>box(x,-10,4,20,0)).join('')),
 keys:box(-36,-13,72,26)+white(box(-32,-6,64,15,0))+[-27,-19,-11,-3,5,13,21,29].map(x=>box(x,-6,2,9,0)).join(''),
 grand:'<path d="M-31 21V1c0-17 15-29 29-29 11 0 16 6 16 16 0 10 9 16 17 18v15Z"/>'+white(box(-27,12,54,5,0)),
 guitar:'<path d="M-6-30H6v23c11 3 15 9 14 17-1 11-10 18-20 18S-19 21-20 10c-1-8 3-14 14-17Z"/>'+white(circle(0,7,5)),
 strings:'<path d="M-4-31h8v18c13 2 15 8 9 14 8 5 9 14 4 20C9 30-9 30-17 21c-5-6-4-15 4-20-6-6-4-12 9-14z"/>'+white(box(-2,-21,4,36,0)),
 horn:'<path d="M-25-7H9l18-11v36L9 7h-34z"/>'+white(box(-12,-3,19,6,0)),
 box:box(-18,-17,36,34),
 amp:box(-27,-19,54,38)+white(box(-22,-12,44,6))+white(circle(0,6,8)),
 mic:circle(0,8,14)+box(-4,-22,8,31)+circle(0,-22,7),
 boom:circle(-15,15,11)+'<path d="M-17 14l33-34" stroke="currentColor" stroke-width="4"/>'+circle(18,-21,6),
 console:box(-34,-22,68,44)+white([-23,-12,0,12,23].map(x=>box(x,-15,3,29,0)).join('')),
 light:box(-12,-22,24,29,5)+'<path d="M-8 10L-24 30h48L8 10z" opacity=".42"/>'+white(box(-9,0,18,5)),
 moving:box(-18,-17,36,34)+white(circle(0,0,13))+circle(0,0,8)+'<path d="M-8 18H8L0 28z"/>',
 truss:'<path d="M-42-9h84v18h-84zM-42 9l14-18 14 18L0-9 14 9 28-9 42 9" fill="none" stroke="currentColor" stroke-width="3"/>',
 stairs:box(-28,-20,56,40)+white(box(-24,-13,48,5)+box(-24,5,48,5)),
 table:box(-39,-22,78,44)+white(box(-33,-16,66,32,1)),
 chair:box(-18,-13,36,30)+box(-20,-23,40,7)+white(box(-13,-7,26,17)),
 stand:'<path d="M-20-20h40v16h-40zM-2-4h4v19h-4zM-15 17h30v4h-30z"/>',
 position:circle(0,0,19)+white(circle(0,0,13))+circle(0,0,5),
};
export function equipmentShape(symbol,mark){
 const shape=shapes[symbol];
 if(!mark)return shape;
 const safe=mark.replace(/[^0-9A-Za-z×ぁ-んァ-ヶ一-龠/]/g,'');
 return shape+`<g class="equipment-mark"><rect x="-20" y="18" width="40" height="14" rx="3" fill="currentColor"/><text x="0" y="29" fill="white" stroke="none" text-anchor="middle" font-size="10" font-weight="700">${safe}</text></g>`;
}
