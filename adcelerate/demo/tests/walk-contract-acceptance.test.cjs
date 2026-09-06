const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/outdoor-context.js');
const panelPano = '2NoSvJbqMCZ0RXhR8pTSLA';
const frontPano = '9xunlB_EXfx7QBkGq7cZfA';
const state = () => ({status:'ready',pano:panelPano,heading:49.5,
  position:{lat:41.4002271,lng:2.1572578},date:'2023-03',steps:0,supportVisible:true,
  links:[{pano:'bEXJMD15fsJHiwGq5kPbfQ',heading:136.10162,description:'Enlace real'}]});

test('walk metadata is transported separately from audience context', () => {
  const original = state();
  const msg = C.message('walk-state', original);
  assert.equal(msg.context, undefined);
  const accepted = C.validateWalkState(msg.payload);
  assert.deepEqual(accepted, original);
  accepted.links[0].pano = 'changed';
  accepted.position.lat = 0;
  assert.equal(original.links[0].pano, 'bEXJMD15fsJHiwGq5kPbfQ');
  assert.equal(original.position.lat, 41.4002271);
});

test('isolated historical panorama and unknown date have honest valid representations', () => {
  const isolated = {...state(),pano:frontPano,date:'2017-11',links:[],supportVisible:false};
  assert.deepEqual(C.validateWalkState(isolated), isolated);
  const unknown = {...state(),date:'',supportVisible:false};
  assert.equal(C.validateWalkState(unknown).date, '');
  const loading = {...unknown,status:'loading',pano:'',position:null,links:[]};
  assert.ok(C.validateWalkState(loading));
});

test('invalid walking geometry and unbounded payloads are rejected', () => {
  for (const [key,value] of [
    ['heading',NaN],['heading',Infinity],['heading',-1],['heading',361],
    ['steps',-1],['steps',0.5],['steps',1000001],['supportVisible','true'],
    ['status','measured'],['pano','x'.repeat(251)],['date','x'.repeat(101)],
  ]) assert.equal(C.validateWalkState({...state(),[key]:value}), null, key);
  assert.ok(C.validateWalkState({...state(),heading:360}));
  assert.equal(C.validateWalkState({...state(),position:{lat:91,lng:2}}),null);
  assert.equal(C.validateWalkState({...state(),position:{lat:41,lng:Infinity}}),null);
  assert.equal(C.validateWalkState({...state(),links:[{pano:'',heading:30,description:''}]}),null);
  assert.equal(C.validateWalkState({...state(),links:Array.from({length:33},()=>state().links[0])}),null);
});

test('walk commands allow only the documented actions and a bounded link identifier', () => {
  for (const action of ['forward','backward','left','right','look-up','look-down','home','panels','front','zoom-in','zoom-out']) {
    assert.deepEqual(C.validateWalkCommand({action,pano:'unused',code:'ignored'}),{action});
  }
  assert.deepEqual(C.validateWalkCommand({action:'link',pano:panelPano}),{action:'link',pano:panelPano});
  for (const command of [{action:'execute'},{action:'teleport'},{action:'link',pano:''},{action:'link',pano:'x'.repeat(251)},null]) {
    assert.equal(C.validateWalkCommand(command),null);
  }
});

test('foreign windows cannot inject walking state or trigger support selection', () => {
  const child={},other={},origin='https://admira.tv';
  for (const data of [C.message('walk-state',state()),C.message('walk-command',{action:'forward'}),C.message('support-select')]) {
    const event={origin,source:child,data};
    assert.equal(C.accepts(event,child,origin),true);
    assert.equal(C.accepts({...event,source:other},child,origin),false);
    assert.equal(C.accepts({...event,origin:'https://admira.tv.evil.invalid'},child,origin),false);
    assert.equal(C.accepts({...event,data:{...data,version:2}},child,origin),false);
  }
  assert.equal(C.accepts({origin,source:child,data:C.message('walk-state',{...state(),heading:NaN})},child,origin),false);
});

test('human deep links preserve side and remain a single explicit iframe', () => {
  const url = new URL(C.bestEntry('?walk=1&side=panels',false),'https://admira.tv/adcelerate/demo/best/');
  assert.equal(url.pathname,'/adcelerate/demo/');
  assert.equal(url.searchParams.get('view'),'human');
  assert.equal(url.searchParams.get('side'),'panels');
  assert.equal(C.bestEntry('?embed=1&walk=1&side=panels',true),null);
  assert.notEqual(C.bestEntry('?embed=1&walk=1',false),null);
});
