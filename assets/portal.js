const parameters = new URLSearchParams(location.search);
// Keep existing equipment links and authentication callbacks at the root working.
if (['radio','demo','view','auth_code','state'].some(key=>parameters.has(key))) {
  location.replace(new URL(`./festival-radios/${location.search}${location.hash}`,location.href));
} else {
  const icons={radio:'<path d="M8 8V3M6 8h12v13H6zM9 11h6M9 15h6M9 18h3M15 3v2"/>',receipt:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'};
  const root=document.getElementById('apps');
  try {
    const response=await fetch('apps.json');if(!response.ok)throw new Error('apps');
    const apps=await response.json();
    const links=apps.map(app=>{
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.id))throw new Error('app path');
      const link=document.createElement('a');link.className='app-link';link.href=`./${app.id}/`;
      const icon=document.createElement('span');icon.className='app-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=`<svg viewBox="0 0 24 24">${icons[app.icon]||icons.receipt}</svg>`;
      const text=document.createElement('span');text.className='app-text';const title=document.createElement('strong');title.textContent=app.title;
      const description=document.createElement('small');description.textContent=app.description;
      const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');
      text.append(title,description);link.append(icon,text,arrow);return link;
    });root.replaceChildren(...links);
  } catch {
    root.replaceChildren();for(const [url,title] of [['festival-radios/','トランシーバー管理'],['recipt/','領収書']]){const link=document.createElement('a');link.className='app-link';link.href=url;link.textContent=title;root.append(link);}
  }
}
