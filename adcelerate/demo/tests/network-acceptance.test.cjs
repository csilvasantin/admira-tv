const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sites=require('../js/outdoor-sites.js');
const Contract=require('../js/outdoor-context.js');
const Walk=require('../best/street-walk.js');

// Independent acceptance fixtures: Google StreetViewService + renderer getLinks,
// verified 2026-09-06 against Carlos's photograph (March 2023 imagery).
// POV then centered visually at 390px and 1440px, preserving the same panorama.
const jardinets={pano:'L6xcO37SQfBmCxsT9lPdjQ',position:{lat:41.397772717774245,lng:2.1576335976146668},pov:{heading:290,pitch:-6,zoom:.9}};

test('Jardinets preserves the verified panorama, camera position and photographic POV',()=>{
 const site=Sites.get('jardinets');
 assert.deepEqual(site.entry,{pano:jardinets.pano,pov:jardinets.pov});
 assert.deepEqual(site.position,jardinets.position);
 assert.equal(site.targetLabel,'Punto de visita');
 assert.equal(site.audienceSiteId,null);
 assert.equal(site.front,null);
 assert.ok(Object.isFrozen(site.entry.pov));
});

test('next kiosk closes the verified Vila, Jardinets and Lesseps circuit',()=>{
 assert.equal(Sites.next('vila').id,'jardinets');
 assert.equal(Sites.next('jardinets').id,'lesseps');
 assert.equal(Sites.next('lesseps').id,'vila');
 assert.equal(Sites.get('unverified'),null);
 assert.equal(new Set(Sites.all.map(s=>s.id)).size,Sites.all.length);
});

test('site selection and held motion require validated messages from the current frame',()=>{
 const source={},other={},origin='https://admira.tv';
 for(const payload of [{action:'site',siteId:'jardinets'},{action:'forward',hold:true},{action:'backward',hold:false},{action:'release'}]){
  const event={source,origin,data:Contract.message('walk-command',payload)};
  assert.equal(Contract.accepts(event,source,origin),true);
  assert.equal(Contract.accepts({...event,source:other},source,origin),false);
  assert.equal(Contract.accepts({...event,origin:'https://evil.invalid'},source,origin),false);
 }
 for(const p of [{action:'site',siteId:'other'},{action:'forward',hold:'true'},{action:'backward',hold:1}])assert.equal(Contract.validateWalkCommand(p),null);
 assert.deepEqual(Contract.validateWalkCommand({action:'site',siteId:'jardinets',pano:'untrusted'}),{action:'site',siteId:'jardinets'});
});

test('photographic location cannot replace the audience provenance of Vila de Gràcia',()=>{
 const context={siteId:'bcn-kiosk-016',hour:18,baseCount:460,effectiveCount:460,manual:false,selection:'kiosk',mix:{familias:25,jovenes:25,turistas:25,seniors:25},layers:{crowd:true,buildings:true,roads:true,night:false}};
 assert.ok(Contract.validate(context));
 assert.equal(Contract.validate({...context,siteId:'jardinets'}),null);
 assert.equal(Sites.get('vila').audienceSiteId,context.siteId);
 assert.notEqual(Sites.get('jardinets').audienceSiteId,context.siteId);
 assert.equal(Sites.get('lesseps').audienceSiteId,null);
 assert.equal(Contract.validate({...context,siteId:'lesseps'}),null);
});

test('Jardinets deep links survive the legacy entry without embedding recursively',()=>{
 const url=new URL(Contract.bestEntry('?walk=1&site=jardinets',false),'https://admira.tv/adcelerate/demo/best/');
 assert.equal(url.pathname,'/adcelerate/demo/');
 assert.equal(url.searchParams.get('view'),'human');
 assert.equal(url.searchParams.get('site'),'jardinets');
 assert.equal(Contract.bestEntry('?embed=1&walk=1&site=jardinets',true),null);
 assert.equal(new URL(Contract.bestEntry('?walk=1&site=unverified',false),'https://admira.tv').searchParams.has('site'),false);
});

test('Mozart screenshot has two lateral exits; the verified next node opens Jesus',()=>{
 const blocked=[{pano:'8jvEKXS_zTVe8OzWA26yKg',heading:319.84552},{pano:'ChcRiAHJGowOisoZmsbTng',heading:139.3922}];
 assert.equal(Walk.chooseLink(blocked,234),null);
 assert.equal(Walk.chooseLink(blocked,139).pano,'ChcRiAHJGowOisoZmsbTng');
 const intersection=[{pano:'ri33zzkLzbZkkbAEBoWwiQ',heading:256.35852},{pano:'kXNXtwitnXq2LNBGEWOSFQ',heading:139.25279},{pano:'neHfCciaSwwcDYjCqOBBKQ',heading:319.39218}];
 assert.equal(Walk.chooseLink(intersection,234).pano,'ri33zzkLzbZkkbAEBoWwiQ');
});

test('historical crossing alternative is an explicit command with boolean, frame-bound availability',()=>{
 const origin='https://admira.tv',source={};
 const state={siteId:'vila',status:'ready',pano:'CwrbI-sF75wSN69YO9QYEg',heading:234,position:{lat:41.39942127597713,lng:2.158188340041832},date:'2022-02',links:[],steps:9,supportVisible:false,canOpenJesus2023:true,canEnterJesus:false,routeActive:false};
 assert.deepEqual(Contract.validateWalkState(state),state);
 assert.equal(Contract.validateWalkState({...state,canOpenJesus2023:'true'}),null);
 const data=Contract.message('walk-command',{action:'jesus-2023'});
 assert.equal(Contract.accepts({source,origin,data},source,origin),true);
 assert.equal(Contract.accepts({source:{},origin,data},source,origin),false);
});
