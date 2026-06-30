/* admira-nav.js — chrome unificado de admira.tv (barra superior Codex + sidebar plegable + panel detalle).
 * Uso en cualquier página:
 *   <script src="/admira-nav.js" data-active="calendar" data-title="Calendario de emisión" defer></script>
 * data-active: flota|calendar|condicional|canal|mural|comprar|alta|help   ·   data-title: subtítulo de la barra.
 * Estado (plegado/detalle) compartido entre páginas vía localStorage. v.30.06.2026.r25 */
(function(){
  if(window.__admnav) return; window.__admnav=true;
  var s=document.currentScript;
  var cfg=window.ADMIRA_NAV||{};
  var active=(s&&s.dataset.active)||cfg.active||'';
  var title=(s&&s.dataset.title)||cfg.title||'';
  var brandTag=(cfg&&cfg.brandTag)||(s&&s.dataset.brand)||'tv';  // sufijo de marca "Admira · tv" (configurable por página)
  function _norm(u){return String(u).replace(/^https?:\/\/[^/]+/,'').replace(/index\.html$/,'').replace(/\/+$/,'')||'/';}
  var VER=window.ADMIRA_VERSION||'v.30.06.2026.r25';
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

  // Iconos monolínea estilo Matrix (verde fósforo + glow, vía CSS). Heredan currentColor.
  var _S='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS={
    flota:       _S+'<circle cx="12" cy="9" r="1.5"/><path d="M12 10.5V20M8.5 20h7"/><path d="M8.3 6.4a4.8 4.8 0 0 0 0 7.2M15.7 6.4a4.8 4.8 0 0 1 0 7.2"/><path d="M6 4.2a8 8 0 0 0 0 11.6M18 4.2a8 8 0 0 1 0 11.6"/></svg>',
    calendar:    _S+'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.2h17M8 3.5v3M16 3.5v3"/><circle cx="8.5" cy="13.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="13.5" r=".9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="13.5" r=".9" fill="currentColor" stroke="none"/></svg>',
    condicional: _S+'<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3"/></svg>',
    canal:       _S+'<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/><path d="M10.4 8.1l4.2 2.9-4.2 2.9z" fill="currentColor" stroke="none"/></svg>',
    mural:       _S+'<rect x="3.5" y="3.5" width="7" height="7" rx="1.3"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.3"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.3"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.3"/></svg>',
    comprar:     _S+'<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2.5 3.6h2.3l2.2 11.1a1.5 1.5 0 0 0 1.5 1.2h7.7a1.5 1.5 0 0 0 1.5-1.2l1.3-6.9H6.1"/></svg>',
    alta:        _S+'<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M12 8v8M8 12h8"/></svg>',
    help:        _S+'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.5"/><circle cx="12" cy="16.6" r=".5" fill="currentColor" stroke="none"/></svg>',
    control:     _S+'<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="14.5" r="2"/><circle cx="19" cy="7" r="2"/></svg>',
    programar:   _S+'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.2h17M8 3.5v3M16 3.5v3M12 12v5M9.5 14.5h5"/></svg>'
  };
  function IC(k){ return ICONS[k]||''; }
  try{ window.AdmiraIcon=IC; window.AdmiraIconSet=ICONS; }catch(_){}

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
   ".admtop .admhome{color:inherit;text-decoration:none;border-radius:6px;padding:1px 5px;margin:0 -3px;transition:color .15s,background .15s}",
   ".admtop .admhome:hover{color:#fff;background:#13203a}",
   ".admtop .admver{font:600 10.5px ui-monospace,monospace;color:#8595ad;border:1px solid #1e2940;border-radius:999px;padding:1px 7px;margin-left:8px;vertical-align:2px}",
   ".admtop .admsub{color:#8595ad;font-size:12px;white-space:nowrap}",
   ".admtop .admsp{flex:1}",
   /* enlaces de ecosistema en la barra superior (cfg.topRight) */
   ".admtop .admtR{color:#9fb0c6;text-decoration:none;font:600 13px -apple-system,Segoe UI,sans-serif;padding:5px 9px;border-radius:8px;transition:color .15s,background .15s}",
   ".admtop .admtR:hover{color:#fff;background:#13203a}",
   ".admtop .admtR-cta{color:#04110b;background:#7aa2ff}",
   ".admtop .admtR-cta:hover{background:#9bb8ff}",
   "@media(max-width:760px){.admtop .admsub{display:none}.admtop .admtR:not(.admtR-cta){display:none}}",
   /* conmutador de pestañas en la barra superior (p.ej. Planificar ↔ Calendario) */
   ".admtop .admseg{display:inline-flex;align-items:center;gap:2px;background:#0e1420;border:1px solid #1e2940;border-radius:10px;padding:2px}",
   ".admtop .admseg a{display:inline-flex;align-items:center;gap:6px;color:#9fb0c6;text-decoration:none;font:600 12.5px -apple-system,Segoe UI,sans-serif;padding:5px 11px;border-radius:8px;transition:color .15s,background .15s;white-space:nowrap}",
   ".admtop .admseg a:hover{color:#fff;background:#13203a}",
   ".admtop .admseg a.on{color:#04110b;background:#3df08a}",
   ".admtop .admseg a svg{width:15px;height:15px;flex:none}",
   "@media(max-width:760px){.admtop .admseg a .lbl{display:none}}",
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
   ".admni .ic{flex:none;width:24px;height:24px;display:grid;place-items:center}",
   /* iconos Matrix: verde fósforo + glow, heredan currentColor */
   ".admni .ic svg{width:20px;height:20px;display:block;color:#3df08a;filter:drop-shadow(0 0 2.5px rgba(61,240,138,.5));transition:color .15s,filter .15s}",
   ".admni:hover .ic svg{color:#8effc4;filter:drop-shadow(0 0 5px rgba(61,240,138,.85))}",
   ".admni.on .ic svg{color:#9dffce;filter:drop-shadow(0 0 6px rgba(61,240,138,.95))}",
   ".admlinks a .dic{display:inline-grid;place-items:center;width:18px;height:18px;vertical-align:-4px;margin-right:8px}",
   ".admlinks a .dic svg{width:15px;height:15px;color:#3df08a;filter:drop-shadow(0 0 2px rgba(61,240,138,.45))}",
   ".admlinks a:hover .dic svg{color:#8effc4}",
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
      return '<a class="admni'+(i.k===active?' on':'')+'" href="'+i.h+'"'+(i.blank?' target="_blank" rel="noopener"':'')+(i.k===active?' aria-current="page"':'')+' title="'+i.t+'"><span class="ic">'+IC(i.k)+'</span><span class="t">'+i.t+'</span></a>';
    }).join("");
    return '<aside class="admside" id="admSide" aria-label="Navegación">'+lis+
      (cfg.extraNav||'')+
      '<div class="admspace"></div>'+
      '<div class="admsep"></div>'+
      '<a class="admni" href="https://www.xpaceos.com/control/" target="_blank" rel="noopener" title="Control de propietario (XpaceOS)"><span class="ic">'+IC('control')+'</span><span class="t">Control ↗</span></a>'+
      '<div class="admfoot" id="admFoot">'+VER+'</div>'+
    '</aside>';
  }
  function detHTML(){
    var links=ITEMS.map(function(i){return '<a href="'+i.h+'"'+(i.blank?' target="_blank" rel="noopener"':'')+'><span class="dic">'+IC(i.k)+'</span>'+i.t+'</a>';}).join("");
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
  function emiSwitchHTML(){
    // Conmutador de emisión Planificar ↔ Calendario, disponible en TODA página del chrome.
    return '<span class="admseg" aria-label="Emisión">'+
      '<a class="'+(active==='flota'?'on':'')+'" href="/cms.html?prog=1" title="Planificar emisión — programar la parrilla">'+IC('programar')+'<span class="lbl">Planificar</span></a>'+
      '<a class="'+(active==='calendar'?'on':'')+'" href="/cms/calendar/" title="Calendario de emisión">'+IC('calendar')+'<span class="lbl">Calendario</span></a>'+
    '</span>';
  }
  function topHTML(){
    return '<header class="admtop">'+
      '<button class="admtog" id="admNavTog" title="Plegar / desplegar menú (m)">☰</button>'+
      '<span class="admbrand"><a href="/" class="admhome" title="Volver a la home · Admira.tv">Admira</a> · <b>'+brandTag+'</b><span class="admver">'+VER+'</span></span>'+
      (title?'<span class="admsub">'+title+'</span>':'')+
      '<span class="admsp"></span>'+
      emiSwitchHTML()+
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
