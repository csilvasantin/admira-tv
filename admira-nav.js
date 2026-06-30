/* admira-nav.js — chrome unificado de admira.tv (barra superior Codex + sidebar plegable + panel detalle).
 * Uso en cualquier página:
 *   <script src="/admira-nav.js" data-active="calendar" data-title="Calendario de emisión" defer></script>
 * data-active: flota|calendar|condicional|canal|mural|comprar|alta|help   ·   data-title: subtítulo de la barra.
 * Estado (plegado/detalle) compartido entre páginas vía localStorage. v.30.06.2026.r18 */
(function(){
  if(window.__admnav) return; window.__admnav=true;
  var s=document.currentScript;
  var cfg=window.ADMIRA_NAV||{};
  var active=(s&&s.dataset.active)||cfg.active||'';
  var title=(s&&s.dataset.title)||cfg.title||'';
  function _norm(u){return String(u).replace(/^https?:\/\/[^/]+/,'').replace(/index\.html$/,'').replace(/\/+$/,'')||'/';}
  var VER=window.ADMIRA_VERSION||'v.30.06.2026.r18';
  // Extensiones opcionales (las usa cms.html): cfg.topRight (HTML controles barra), cfg.extraNav (HTML items sidebar),
  // cfg.detailTop (HTML secciones detalle), cfg.onDetail (fn al abrir/refrescar el detalle).

  var ITEMS=[
    {k:'flota',      h:'/cms.html',                         ic:'🛰', t:'Flota'},
    {k:'calendar',   h:'/cms/calendar/',                    ic:'🗓', t:'Calendario'},
    {k:'condicional',h:'/condicional.html',                 ic:'🎯', t:'Condicional'},
    {k:'canal',      h:'/canal.html', blank:true,           ic:'📺', t:'Canal'},
    {k:'mural',      h:'/wall/',                            ic:'🖥', t:'Mural'},
    {k:'comprar',    h:'/comprar/',                         ic:'🛒', t:'Comprar'},
    {k:'alta',       h:'/alta.html',                        ic:'➕',       t:'Alta'},
    {k:'help',       h:'/help/',                            ic:'❓',       t:'Ayuda'}
  ];
  if(!active){ var _here=_norm(location.pathname); for(var _i=0;_i<ITEMS.length;_i++){ if(_norm(ITEMS[_i].h)===_here){active=ITEMS[_i].k;break;} } }

  var CSS = [
   ":root{--admtb:52px}",
   "html.admnav{--admnw:64px;--admrw:0px;padding-top:var(--admtb);padding-left:var(--admnw);padding-right:var(--admrw);",
     "transition:padding .18s ease;box-sizing:border-box}",
   "html.admnav.admnav-open{--admnw:238px}",
   "html.admnav.admnav-det{--admrw:320px}",
   "html.admnav body>header:not(.admtop){top:var(--admtb)!important}",
   /* barra superior Codex */
   ".admtop{position:fixed;top:0;left:0;right:0;height:var(--admtb);z-index:45;display:flex;align-items:center;gap:11px;",
     "padding:0 12px;background:#0a0e16ee;backdrop-filter:blur(10px);border-bottom:1px solid #1e2940;",
     "font:14px -apple-system,Segoe UI,Roboto,sans-serif;color:#cdd8e8}",
   ".admtop .admtog{flex:none;width:34px;height:34px;border-radius:9px;border:1px solid #1e2940;background:#0e1420;color:#cdd8e8;",
     "font-size:16px;cursor:pointer;display:grid;place-items:center}",
   ".admtop .admtog:hover{border-color:#7aa2ff;color:#fff}",
   ".admtop .admtog.on{background:#7aa2ff;border-color:#7aa2ff;color:#04110b}",
   ".admtop .admbrand{font-weight:800;letter-spacing:.5px;font-size:16px;white-space:nowrap;color:#cdd8e8}",
   ".admtop .admbrand b{color:#7aa2ff}",
   ".admtop .admver{font:600 10.5px ui-monospace,monospace;color:#8595ad;border:1px solid #1e2940;border-radius:999px;padding:1px 7px;margin-left:8px;vertical-align:2px}",
   ".admtop .admsub{color:#8595ad;font-size:12px;white-space:nowrap}",
   ".admtop .admsp{flex:1}",
   "@media(max-width:760px){.admtop .admsub{display:none}}",
   /* sidebar */
   ".admside{position:fixed;left:0;top:var(--admtb);bottom:0;width:var(--admnw);background:#080b12;border-right:1px solid #1e2940;",
     "z-index:40;display:flex;flex-direction:column;gap:3px;padding:10px 9px;overflow-x:hidden;overflow-y:auto;",
     "transition:width .18s ease;scrollbar-width:thin}",
   ".admside::-webkit-scrollbar{width:6px}.admside::-webkit-scrollbar-thumb{background:#1e2940;border-radius:3px}",
   ".admni{display:flex;align-items:center;gap:13px;width:100%;padding:9px 10px;border-radius:11px;border:1px solid transparent;",
     "background:transparent;color:#cdd8e8;font:600 13px -apple-system,Segoe UI,sans-serif;cursor:pointer;",
     "text-decoration:none;white-space:nowrap;overflow:hidden;text-align:left;position:relative}",
   ".admni:hover{background:#13203a;border-color:#26385e;color:#fff}",
   ".admni.on{background:rgba(122,162,255,.13);border-color:#2a3a66;color:#fff}",
   ".admni.on::before{content:'';position:absolute;left:1px;top:8px;bottom:8px;width:3px;border-radius:3px;background:#7aa2ff}",
   ".admni .ic{flex:none;width:24px;text-align:center;font-size:17px}",
   ".admni .t{transition:opacity .12s}",
   "@media(min-width:681px){html.admnav:not(.admnav-open) .admni:hover::after{content:attr(title);position:absolute;left:calc(100% + 12px);top:50%;transform:translateY(-50%);background:#0e1420;border:1px solid #26385e;color:#cdd8e8;padding:5px 9px;border-radius:7px;font:600 12px -apple-system,Segoe UI,sans-serif;white-space:nowrap;z-index:60;box-shadow:0 6px 18px #0008;pointer-events:none}}",
   ".admsep{height:1px;background:#1e2940;margin:7px 6px}",
   ".admspace{flex:1;min-height:6px}",
   ".admfoot{padding:6px 10px;color:#8595ad;font:600 11px ui-monospace,monospace;white-space:nowrap;overflow:hidden}",
   "html.admnav:not(.admnav-open) .admni .t,html.admnav:not(.admnav-open) .admfoot{opacity:0;pointer-events:none}",
   /* panel detalle */
   ".admdet{position:fixed;top:var(--admtb);right:0;bottom:0;width:320px;background:#080b12;border-left:1px solid #1e2940;",
     "z-index:40;transform:translateX(100%);transition:transform .18s ease;overflow-y:auto;padding:14px 14px 30px;",
     "display:flex;flex-direction:column;gap:12px;color:#cdd8e8;font:14px -apple-system,Segoe UI,sans-serif;scrollbar-width:thin}",
   ".admdet::-webkit-scrollbar{width:6px}.admdet::-webkit-scrollbar-thumb{background:#1e2940;border-radius:3px}",
   "html.admnav.admnav-det .admdet{transform:none}",
   ".admdet .hd{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800}",
   ".admdet .pro{font:700 9.5px ui-monospace,monospace;color:#7aa2ff;border:1px solid #2a3a66;border-radius:999px;padding:1px 6px;letter-spacing:.5px}",
   ".admsec{background:#0e131c;border:1px solid #1e2940;border-radius:12px;padding:10px 12px}",
   ".admsec h4{margin:0 0 6px;font:700 11px ui-monospace,monospace;color:#8595ad;text-transform:uppercase;letter-spacing:.5px}",
   ".admrow{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12.5px;color:#8595ad}",
   ".admrow b{color:#cdd8e8;font-weight:700;font-family:ui-monospace,monospace}",
   ".admkeys{font:11.5px ui-monospace,monospace;color:#8595ad;line-height:1.9}",
   ".admlinks{display:flex;flex-direction:column;gap:6px}",
   ".admlinks a{color:#cdd8e8;text-decoration:none;font-size:13px;font-weight:600;padding:6px 9px;border-radius:8px;border:1px solid #1e2940;background:#0e1420}",
   ".admlinks a:hover{border-color:#7aa2ff;color:#fff}",
   ".admscrim{position:fixed;inset:0;background:#000a;z-index:39;display:none}",
   "@media(max-width:680px){",
     "html.admnav{padding-left:0;padding-right:0}",
     ".admside{width:238px;transform:translateX(-100%);transition:transform .2s ease;box-shadow:12px 0 40px #000c}",
     "html.admnav.admnav-open .admside{transform:none}",
     "html.admnav:not(.admnav-open) .admni .t,html.admnav:not(.admnav-open) .admfoot{opacity:1;pointer-events:auto}",
     "html.admnav.admnav-open .admscrim{display:block}",
     ".admdet{width:min(320px,86vw)}",
   "}"
  ].join("");

  function navHTML(){
    var lis=ITEMS.map(function(i){
      return '<a class="admni'+(i.k===active?' on':'')+'" href="'+i.h+'"'+(i.blank?' target="_blank" rel="noopener"':'')+(i.k===active?' aria-current="page"':'')+' title="'+i.t+'"><span class="ic">'+i.ic+'</span><span class="t">'+i.t+'</span></a>';
    }).join("");
    return '<aside class="admside" id="admSide" aria-label="Navegación">'+lis+
      (cfg.extraNav||'')+
      '<div class="admspace"></div>'+
      '<div class="admsep"></div>'+
      '<a class="admni" href="https://www.xpaceos.com/control/" target="_blank" rel="noopener" title="Control de propietario (XpaceOS)"><span class="ic">🏬</span><span class="t">Control ↗</span></a>'+
      '<div class="admfoot" id="admFoot">'+VER+'</div>'+
    '</aside>';
  }
  function detHTML(){
    var links=ITEMS.map(function(i){return '<a href="'+i.h+'"'+(i.blank?' target="_blank" rel="noopener"':'')+'>'+i.ic+' '+i.t+'</a>';}).join("");
    return '<aside class="admdet" id="admDet" aria-label="Detalle">'+
      '<div class="hd">Detalle <span class="pro">PRO</span></div>'+
      (cfg.detailTop||'')+
      '<div class="admsec"><h4>Sistema</h4>'+
        '<div class="admrow"><span>Página</span><b id="adm-d-page">'+(title||active||'—')+'</b></div>'+
        '<div class="admrow"><span>Fuente</span><b>api.admira.store</b></div>'+
        '<div class="admrow"><span>API</span><b id="adm-d-api">—</b></div>'+
        '<div class="admrow"><span>Hora</span><b id="adm-d-time">—</b></div>'+
        '<div class="admrow"><span>Versión</span><b id="adm-d-ver">'+VER+'</b></div>'+
      '</div>'+
      '<div class="admsec"><h4>Atajos</h4><div class="admkeys">m menú · d detalle</div></div>'+
      '<div class="admsec"><h4>Navegación</h4><div class="admlinks">'+links+'</div></div>'+
    '</aside>';
  }
  function topHTML(){
    return '<header class="admtop">'+
      '<button class="admtog" id="admNavTog" title="Plegar / desplegar menú (m)">☰</button>'+
      '<span class="admbrand">Admira · <b>CMS</b><span class="admver">'+VER+'</span></span>'+
      (title?'<span class="admsub">'+title+'</span>':'')+
      '<span class="admsp"></span>'+
      (cfg.topRight||'')+
      '<button class="admtog" id="admDetTog" title="Panel de detalle (d)" aria-label="Panel de detalle"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="15" y1="4" x2="15" y2="20"/></svg></button>'+
    '</header>';
  }

  function init(){
    var st=document.createElement('style'); st.id='admnav-css'; st.textContent=CSS; document.head.appendChild(st);
    document.documentElement.classList.add('admnav');
    var holder=document.createElement('div');
    holder.innerHTML = topHTML()+navHTML()+detHTML()+'<div class="admscrim" id="admScrim"></div>';
    document.body.prepend.apply(document.body, Array.prototype.slice.call(holder.childNodes));

    var html=document.documentElement;
    var navTog=document.getElementById('admNavTog');
    var detTog=document.getElementById('admDetTog');
    function setNav(open){ html.classList.toggle('admnav-open',open); try{localStorage.setItem('cms_nav_open',open?'1':'0')}catch(_){} if(navTog){navTog.textContent=open?'«':'☰'; navTog.title=open?'Contraer menú (m)':'Desplegar menú (m)';} }
    function pingApi(){ var e=document.getElementById('adm-d-api'); if(!e)return; e.textContent='…'; var t0=(new Date()).getTime();
      fetch('https://api.admira.store/pay/list?_h='+t0,{cache:'no-store'}).then(function(r){ e.textContent=(r.ok?'ok':('HTTP '+r.status))+' · '+((new Date()).getTime()-t0)+'ms'; }).catch(function(){ e.textContent='sin conexión'; }); }
    function setDet(open){ html.classList.toggle('admnav-det',open); if(detTog)detTog.classList.toggle('on',open); try{localStorage.setItem('cms_det_open',open?'1':'0')}catch(_){} if(open){tick();pingApi();} }
    function tick(){ var e=document.getElementById('adm-d-time'); if(e)e.textContent=new Date().toLocaleTimeString('es-ES'); if(typeof cfg.onDetail==='function'){try{cfg.onDetail();}catch(_){}} }
    window.admToggleNav=function(){setNav(!html.classList.contains('admnav-open'));};
    window.admToggleDet=function(){setDet(!html.classList.contains('admnav-det'));};
    if(navTog)navTog.onclick=window.admToggleNav;
    if(detTog)detTog.onclick=window.admToggleDet;
    var scrim=document.getElementById('admScrim'); if(scrim)scrim.onclick=function(){setNav(false);};

    var sn=null,sd=null; try{sn=localStorage.getItem('cms_nav_open');sd=localStorage.getItem('cms_det_open');}catch(_){}
    setNav(sn==null ? window.innerWidth>980 : sn==='1');
    setDet(sd==='1');
    setInterval(function(){ if(html.classList.contains('admnav-det')) tick(); },1000);

    document.addEventListener('keydown',function(e){
      var t=e.target, tag=(t&&t.tagName||'').toLowerCase();
      if(tag==='input'||tag==='textarea'||tag==='select'||(t&&t.isContentEditable))return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key==='m'||e.key==='M')window.admToggleNav();
      else if(e.key==='d'||e.key==='D')window.admToggleDet();
    });
  }
  if(document.body) init(); else document.addEventListener('DOMContentLoaded',init);
})();
