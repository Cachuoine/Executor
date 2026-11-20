(function(){
  'use strict';
  const body=document.body;
  if(!body||body.classList.contains('nr-portal-ready')) return;
  body.classList.add('nr-portal-mode','nr-portal-ready');
  const panels={
    home:['.hero','.stats-strip','.closing-section'],
    catalog:['#catalog'],
    versions:['#versions'],
    music:['#music']
  };
  const all=Object.values(panels).flatMap(selectors=>selectors.map(selector=>document.querySelector(selector)).filter(Boolean));
  function activate(key,updateHash=true){
    if(!panels[key]) key='home';
    all.forEach(node=>{node.hidden=!panels[key].some(selector=>document.querySelector(selector)===node);node.classList.toggle('nr-portal-active',!node.hidden)});
    document.querySelectorAll('[data-main-nav]').forEach(link=>{
      const active=link.dataset.mainNav===key;
      link.classList.toggle('active',active);
      if(active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
    body.dataset.portalPage=key;
    if(updateHash&&location.hash!==`#${key}`) history.pushState({portalPage:key},'',`#${key}`);
    if(key==='catalog') document.getElementById('catalogSearch')?.blur();
    window.dispatchEvent(new CustomEvent('nightreaper:portal-change',{detail:{page:key}}));
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link) return;
    const key=(link.getAttribute('href')||'').slice(1);
    if(!panels[key]) return;
    event.preventDefault(); event.stopImmediatePropagation(); activate(key);
    document.querySelector('.main-nav')?.classList.remove('open');
    document.getElementById('mobileMenuToggle')?.setAttribute('aria-expanded','false');
  },true);
  window.addEventListener('popstate',()=>activate(location.hash.slice(1)||'home',false));
  window.addEventListener('hashchange',()=>activate(location.hash.slice(1)||'home',false));
  const initial=panels[location.hash.slice(1)]?location.hash.slice(1):'home';
  activate(initial,false);
})();
