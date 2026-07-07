/* admira-nav.js — chrome unificado de admira.tv (barra superior Codex + sidebar plegable + panel detalle).
 * Uso en cualquier página:
 *   <script src="/admira-nav.js" data-active="calendar" data-title="Calendario de emisión" defer></script>
 * data-active: flota|calendar|condicional|canal|mural|comprar|alta|help   ·   data-title: subtítulo de la barra.
 * Estado (plegado/detalle) compartido entre páginas vía localStorage. v.08.07.2026.r2 */
(function(){
  if(window.__admnav) return; window.__admnav=true;
  var s=document.currentScript;
  var cfg=window.ADMIRA_NAV||{};
  var active=(s&&s.dataset.active)||cfg.active||'';
  var title=(s&&s.dataset.title)||cfg.title||'';
  var brandTag=(cfg&&cfg.brandTag)||(s&&s.dataset.brand)||'tv';  // sufijo de marca "Admira · tv" (configurable por página)
  function _norm(u){return String(u).replace(/^https?:\/\/[^/]+/,'').replace(/index\.html$/,'').replace(/\/+$/,'')||'/';}
  var VER=window.ADMIRA_VERSION||'v.08.07.2026.r2';
  // Extensiones opcionales (las usa cms.html): cfg.topRight (HTML controles barra), cfg.extraNav (HTML items sidebar),
  // cfg.detailTop (HTML secciones detalle), cfg.onDetail (fn al abrir/refrescar el detalle).

  var ITEMS=[
    {k:'flota',      h:'/cms.html',                         ic:'🛰', t:'Flota'},
    {k:'apps',       h:'/apps/',                            ic:'▦', t:'Apps'},
    {k:'calendar',   h:'/cms/calendar/',                    ic:'🗓', t:'Calendario'},
    {k:'condicional',h:'/condicional.html',                 ic:'🎯', t:'Condicional'},
    {k:'canal',      h:'/canal.html', blank:true,           ic:'📺', t:'Canal'},
    {k:'mural',      h:'/wall/',                            ic:'🖥', t:'Mural'},
    {k:'comprar',    h:'/comprar/',                         ic:'🛒', t:'Comprar'},
    {k:'adcelerate', h:'/adcelerate/',                      ic:'📣',       t:'ADcelerate'},
    {k:'alta',       h:'/alta.html',                        ic:'➕',       t:'Alta'},
    {k:'help',       h:'/help/',                            ic:'❓',       t:'Ayuda'}
  ];
  if(!active){ var _here=_norm(location.pathname); for(var _i=0;_i<ITEMS.length;_i++){ if(_norm(ITEMS[_i].h)===_here){active=ITEMS[_i].k;break;} } }

  // Iconos monolínea estilo Matrix (verde fósforo + glow, vía CSS). Heredan currentColor.
  var _S='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
  var ICONS={
    flota:       _S+'<circle cx="12" cy="9" r="1.5"/><path d="M12 10.5V20M8.5 20h7"/><path d="M8.3 6.4a4.8 4.8 0 0 0 0 7.2M15.7 6.4a4.8 4.8 0 0 1 0 7.2"/><path d="M6 4.2a8 8 0 0 0 0 11.6M18 4.2a8 8 0 0 1 0 11.6"/></svg>',
    calendar:    _S+'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.2h17M8 3.5v3M16 3.5v3"/><circle cx="8.5" cy="13.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="13.5" r=".9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="13.5" r=".9" fill="currentColor" stroke="none"/></svg>',
    condicional: _S+'<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3"/></svg>',
    canal:       _S+'<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/><path d="M10.4 8.1l4.2 2.9-4.2 2.9z" fill="currentColor" stroke="none"/></svg>',
    mural:       _S+'<rect x="3.5" y="3.5" width="7" height="7" rx="1.3"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.3"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.3"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.3"/></svg>',
    comprar:     _S+'<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2.5 3.6h2.3l2.2 11.1a1.5 1.5 0 0 0 1.5 1.2h7.7a1.5 1.5 0 0 0 1.5-1.2l1.3-6.9H6.1"/></svg>',
    adcelerate:  _S+'<path d="M3.5 10v4a1.5 1.5 0 0 0 1.5 1.5h2l7 4.5V4L7 8.5H5A1.5 1.5 0 0 0 3.5 10z"/><path d="M17.5 8.5a5 5 0 0 1 0 7M20 6a8.5 8.5 0 0 1 0 12"/></svg>',
    alta:        _S+'<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M12 8v8M8 12h8"/></svg>',
    help:        _S+'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.5"/><circle cx="12" cy="16.6" r=".5" fill="currentColor" stroke="none"/></svg>',
    control:     _S+'<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="14.5" r="2"/><circle cx="19" cy="7" r="2"/></svg>',
    programar:   _S+'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.2h17M8 3.5v3M16 3.5v3M12 12v5M9.5 14.5h5"/></svg>',
    /* Lanzadera de aplicaciones (18 apps del stack Admira, réplica mejorada de new.admira.mobi) */
    apps:               _S+'<rect x="3.5" y="3.5" width="5" height="5" rx="1.4"/><rect x="9.5" y="3.5" width="5" height="5" rx="1.4"/><rect x="15.5" y="3.5" width="5" height="5" rx="1.4"/><rect x="3.5" y="9.5" width="5" height="5" rx="1.4"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.4"/><rect x="15.5" y="9.5" width="5" height="5" rx="1.4"/><rect x="3.5" y="15.5" width="5" height="5" rx="1.4"/><rect x="9.5" y="15.5" width="5" height="5" rx="1.4"/><rect x="15.5" y="15.5" width="5" height="5" rx="1.4"/></svg>',
    dashboard:          _S+'<path d="M3.6 16.5a8.4 8.4 0 0 1 16.8 0"/><path d="M12 16.5l4.2-4.6"/><circle cx="12" cy="16.5" r="1.3" fill="currentColor" stroke="none"/><path d="M5.7 12.6l.8.8M12 7.2v1.4M18.3 12.6l-.8.8"/></svg>',
    digitalsignage:     _S+'<rect x="4" y="3.5" width="16" height="11" rx="1.8"/><path d="M12 14.5V20M8.5 20h7M7.5 7h6M7.5 10h9"/></svg>',
    contentcatalogue:   _S+'<path d="M12 3.2 3.5 7.3 12 11.4 20.5 7.3 12 3.2Z"/><path d="M3.5 12 12 16.1 20.5 12M3.5 16.6 12 20.7 20.5 16.6"/></svg>',
    support:            _S+'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.3"/><path d="M6 6l3.6 3.6M18 6l-3.6 3.6M6 18l3.6-3.6M18 18l-3.6-3.6"/></svg>',
    pushnotifications:  _S+'<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/></svg>',
    virtualassistant:   _S+'<path d="M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9l-4.5 3.5V16.5H4A1.5 1.5 0 0 1 2.5 15V6A1.5 1.5 0 0 1 4 4.5Z"/><path d="M12 7.6l.85 1.75 1.75.85-1.75.85L12 13.6l-.85-1.75-1.75-.85 1.75-.85Z" fill="currentColor" stroke="none"/></svg>',
    accesscontrol:      _S+'<path d="M12 2.6 5 5.3v5.2c0 4.4 3 8.2 7 9.4 4-1.2 7-5 7-9.4V5.3Z"/><circle cx="12" cy="10.3" r="1.7"/><path d="M12 12v2.6"/></svg>',
    gamification:       _S+'<path d="M7 4.5h10v3a5 5 0 0 1-10 0Z"/><path d="M7 5.5H4.5V7a2.5 2.5 0 0 0 2.5 2.5M17 5.5h2.5V7a2.5 2.5 0 0 1-2.5 2.5"/><path d="M12 12.5V16M9.5 20l.5-4h4l.5 4Z"/></svg>',
    iotmanager:         _S+'<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="4.2" r="1.6"/><circle cx="12" cy="19.8" r="1.6"/><circle cx="4.6" cy="8" r="1.6"/><circle cx="19.4" cy="8" r="1.6"/><path d="M12 5.8v4M12 14.2v4M10.1 11l-4-2.2M13.9 11l4-2.2"/></svg>',
    videoanalytics:     _S+'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    radioanalytics:     _S+'<circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M6.2 6.2a8.2 8.2 0 0 0 0 11.6M17.8 6.2a8.2 8.2 0 0 1 0 11.6"/></svg>',
    socialwifi:         _S+'<path d="M2.6 8.6a13 13 0 0 1 18.8 0M5.7 11.9a8.4 8.4 0 0 1 12.6 0M8.7 15.1a4 4 0 0 1 6.6 0"/><circle cx="12" cy="18.4" r="1.1" fill="currentColor" stroke="none"/></svg>',
    queuemanager:       _S+'<path d="M3.5 8A1.5 1.5 0 0 1 5 6.5h14A1.5 1.5 0 0 1 20.5 8v1.6a1.9 1.9 0 0 0 0 4.8V16A1.5 1.5 0 0 1 19 17.5H5A1.5 1.5 0 0 1 3.5 16v-1.6a1.9 1.9 0 0 0 0-4.8Z"/><path d="M13.5 7v10"/></svg>',
    roombooking:        _S+'<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 8.2h16M8.5 2v3M15.5 2v3"/><circle cx="12" cy="14" r="3.1"/><path d="M12 12.4V14l1.2 1.2"/></svg>',
    audiobranding:      _S+'<path d="M9 17V5.2l9-2V15"/><circle cx="6.5" cy="17" r="2.4"/><circle cx="15.5" cy="15" r="2.4"/></svg>',
    olfactorymarketing: _S+'<path d="M9 9.5h6l.8 8.2a1.9 1.9 0 0 1-1.9 2.1H10.1a1.9 1.9 0 0 1-1.9-2.1Z"/><path d="M10 9.5V7h4v2.5"/><path d="M12 2.4c-1 1 1 1.5 0 2.7M15.2 3.1c-.8.7.7 1.1 0 2.1"/></svg>',
    virtualreality:     _S+'<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 15h-2.9a1.5 1.5 0 0 1-1.2-.6l-1.1-1.5a2 2 0 0 0-3.6 0l-1.1 1.5a1.5 1.5 0 0 1-1.2.6H5a1.5 1.5 0 0 1-1.5-1.5Z"/></svg>',
    augmentedreality:   _S+'<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M12 8.3 15.4 10v4L12 15.7 8.6 14v-4Z"/><path d="M12 8.3V12l3.4-2M12 12v3.7M12 12 8.6 10"/></svg>'
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
   ".admtop .admbrand{font-weight:800;letter-spacing:.5px;font-size:16px;white-space:nowrap;color:#cdd8e8;min-width:0;flex-shrink:1;overflow:hidden;text-overflow:ellipsis}",
   /* la barra nunca desborda a lo ancho (cero scroll horizontal 320-1440): la marca trunca, los controles fijos no encogen */
   ".admtop .admseg{flex:none}",
   "@media(max-width:600px){.admtop .admver{display:none}}",
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
   /* accesibilidad: skip-link, focus visible por teclado, reduced-motion */
   ".admskip{position:fixed;left:8px;top:-60px;z-index:70;background:#3df08a;color:#04110b;font:700 13px -apple-system,Segoe UI,sans-serif;padding:9px 14px;border-radius:9px;text-decoration:none;transition:top .15s}",
   ".admskip:focus{top:8px;outline:2px solid #04110b;outline-offset:2px}",
   ".admtop a:focus-visible,.admtop button:focus-visible,.admni:focus-visible,.admlinks a:focus-visible,.admseg a:focus-visible,.admhome:focus-visible{outline:2px solid #3df08a;outline-offset:2px;border-radius:8px}",
   "@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}",
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
      '<div class="admsec"><h4>Red en antena</h4>'+
        '<div class="admrow"><span>Pantallas</span><b id="adm-d-scr">—</b></div>'+
        '<div class="admrow"><span>En antena</span><b id="adm-d-air">—</b></div>'+
        '<div class="admrow"><span>Circuitos</span><b id="adm-d-cir">—</b></div>'+
      '</div>'+
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
    return '<span class="admseg" role="group" aria-label="Emisión">'+
      '<a class="'+(active==='flota'?'on':'')+'" href="/cms.html?prog=1" aria-label="Planificar emisión" title="Planificar emisión — programar la parrilla">'+IC('programar')+'<span class="lbl">Planificar</span></a>'+
      '<a class="'+(active==='calendar'?'on':'')+'" href="/cms/calendar/" aria-label="Calendario de emisión" title="Calendario de emisión">'+IC('calendar')+'<span class="lbl">Calendario</span></a>'+
    '</span>';
  }
  function topHTML(){
    return '<header class="admtop">'+
      '<button class="admtog" id="admNavTog" aria-label="Plegar o desplegar el menú" aria-expanded="false" title="Plegar / desplegar menú (m)">☰</button>'+
      '<span class="admbrand"><a href="/" class="admhome" title="Volver a la home · Admira.tv">Admira</a> · <b>'+brandTag+'</b><span class="admver">'+VER+'</span></span>'+
      (title?'<span class="admsub">'+title+'</span>':'')+
      '<span class="admsp"></span>'+
      emiSwitchHTML()+
      (cfg.topRight||'')+
      '<button class="admtog" id="admDetTog" title="Panel de detalle (d)" aria-label="Panel de detalle" aria-expanded="false"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="15" y1="4" x2="15" y2="20"/></svg></button>'+
    '</header>';
  }

  function init(){
    var st=document.createElement('style'); st.id='admnav-css'; st.textContent=CSS; document.head.appendChild(st);
    document.documentElement.classList.add('admnav');
    var holder=document.createElement('div');
    holder.innerHTML = '<a class="admskip" href="#admskip-target">Saltar al contenido</a>'+topHTML()+navHTML()+detHTML()+'<div class="admscrim" id="admScrim"></div>';
    document.body.prepend.apply(document.body, Array.prototype.slice.call(holder.childNodes));
    var _skip=document.querySelector('.admskip');
    if(_skip) _skip.addEventListener('click',function(e){ e.preventDefault(); var m=document.querySelector('main,[role=main],.wrap,#view,#mupi,#stage')||document.querySelector('h1'); if(m){ m.setAttribute('tabindex','-1'); try{m.focus();}catch(_){} m.scrollIntoView(); } });

    var html=document.documentElement;
    var navTog=document.getElementById('admNavTog');
    var detTog=document.getElementById('admDetTog');
    function setNav(open){ html.classList.toggle('admnav-open',open); try{localStorage.setItem('cms_nav_open',open?'1':'0')}catch(_){} if(navTog){navTog.textContent=open?'«':'☰'; navTog.title=open?'Contraer menú (m)':'Desplegar menú (m)'; navTog.setAttribute('aria-expanded',open?'true':'false');} }
    function pingApi(){ var e=document.getElementById('adm-d-api'); if(!e)return; e.textContent='…'; var t0=(new Date()).getTime();
      fetch('https://api.admira.store/pay/list?_h='+t0,{cache:'no-store'}).then(function(r){ e.textContent=(r.ok?'ok':('HTTP '+r.status))+' · '+((new Date()).getTime()-t0)+'ms'; }).catch(function(){ e.textContent='sin conexión'; }); }
    function loadNet(){ var scrEl=document.getElementById('adm-d-scr'); if(!scrEl) return;
      var airEl=document.getElementById('adm-d-air'), cirEl=document.getElementById('adm-d-cir');
      fetch('https://api.admira.store/grid/screens',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
        var scr=(d.screens||[]).filter(function(x){return x&&x.screen;});
        scrEl.textContent=scr.length;
        var cirs={}; scr.forEach(function(s){ if(s.circuit) cirs[s.circuit]=1; }); if(cirEl) cirEl.textContent=Object.keys(cirs).length||'—';
        if(airEl){ airEl.textContent='…';
          Promise.all(scr.map(function(s){ return fetch('https://api.admira.store/signage/now?screen='+encodeURIComponent(s.screen),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}); })).then(function(arr){
            var now=(new Date()).getTime(), live=0; arr.forEach(function(o){ var it=o&&(o.item||o); if(it&&it.ts&&(now-it.ts)<180000) live++; }); airEl.textContent=live;
          });
        }
      }).catch(function(){ scrEl.textContent='sin conexión'; if(airEl)airEl.textContent='—'; if(cirEl)cirEl.textContent='—'; });
    }
    function setDet(open){ html.classList.toggle('admnav-det',open); if(detTog){detTog.classList.toggle('on',open); detTog.setAttribute('aria-expanded',open?'true':'false');} try{localStorage.setItem('cms_det_open',open?'1':'0')}catch(_){} if(open){tick();pingApi();loadNet();} }
    function tick(){ var e=document.getElementById('adm-d-time'); if(e)e.textContent=new Date().toLocaleTimeString('es-ES'); if(typeof cfg.onDetail==='function'){try{cfg.onDetail();}catch(_){}} }
    window.admToggleNav=function(){setNav(!html.classList.contains('admnav-open'));};
    window.admToggleDet=function(){setDet(!html.classList.contains('admnav-det'));};
    if(navTog)navTog.onclick=window.admToggleNav;
    if(detTog)detTog.onclick=window.admToggleDet;
    var scrim=document.getElementById('admScrim'); if(scrim)scrim.onclick=function(){setNav(false);};

    // PWA: manifest + service worker. Solo en páginas navegadas (aquí carga el chrome);
    // NO en la emisión empotrada (canal/signage con embed=mupi no cargan admira-nav.js).
    try{
      if(!document.querySelector('link[rel="manifest"]')){ var _ml=document.createElement('link'); _ml.rel='manifest'; _ml.href='/manifest.webmanifest'; document.head.appendChild(_ml); }
      if(!document.querySelector('link[rel="apple-touch-icon"]')){ var _at=document.createElement('link'); _at.rel='apple-touch-icon'; _at.href='/icon-192.png'; document.head.appendChild(_at); }
      if('serviceWorker' in navigator){ window.addEventListener('load',function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }); }
    }catch(_){}

    var sn=null,sd=null; try{sn=localStorage.getItem('cms_nav_open');sd=localStorage.getItem('cms_det_open');}catch(_){}
    setNav(sn==null ? window.innerWidth>980 : sn==='1');
    setDet(sd==='1');
    var _netTk=0;
    setInterval(function(){ if(html.classList.contains('admnav-det')){ tick(); if(_netTk++ % 15 === 0) loadNet(); } },1000);

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
