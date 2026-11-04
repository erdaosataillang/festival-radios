const zoomButton=document.getElementById('preview-zoom');
zoomButton.onclick=()=>{const expanded=document.querySelector('.paper-wrap').classList.toggle('zoomed');zoomButton.setAttribute('aria-pressed',String(expanded));zoomButton.textContent=expanded?'全体表示':'拡大表示';document.getElementById('zoom-hint').textContent=expanded?'横にスワイプして確認':'A4・1ページ'};
let baseline=window.visualViewport?.height||window.innerHeight,lastWidth=window.innerWidth;
function keyboardState(){
 const width=window.innerWidth,viewport=window.visualViewport?.height||window.innerHeight;
 if(Math.abs(width-lastWidth)>40){baseline=viewport;lastWidth=width;}
 const editing=document.activeElement?.matches('input:not([type=file]),textarea,select');
 if(!editing)baseline=Math.max(baseline,viewport);
 document.body.classList.toggle('keyboard-open',Boolean(editing&&baseline-viewport>130));
}
window.visualViewport?.addEventListener('resize',keyboardState);window.addEventListener('resize',keyboardState);
document.addEventListener('focusin',keyboardState);document.addEventListener('focusout',()=>setTimeout(keyboardState,100));
