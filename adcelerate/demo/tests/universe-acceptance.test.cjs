const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validate, accepts, message, bestEntry} = require('../js/outdoor-context.js');

const context = () => ({
  siteId:'bcn-kiosk-016', hour:13.25, baseCount:375, effectiveCount:225,
  manual:true, selection:'kiosk',
  mix:{familias:38.8, jovenes:20.5, turistas:25.2, seniors:15.5},
  layers:{crowd:true, buildings:true, roads:false, night:false},
});

test('renderer handoff preserves effective crowd, interpolated mix and manual state', () => {
  const sent = context();
  const received = validate(structuredClone(message('context', sent)).context);
  assert.deepEqual(received, sent);
  assert.equal(received.effectiveCount, 225); // weather-adjusted crowd, not base 375
  assert.equal(received.hour, 13.25); // must not collapse to the nearest slot
  received.mix.familias = 0;
  received.layers.roads = true;
  assert.equal(sent.mix.familias, 38.8);
  assert.equal(sent.layers.roads, false);
});

test('zero people and midnight are valid values, not missing-data fallbacks', () => {
  const c = {...context(), hour:0, baseCount:0, effectiveCount:0, manual:false};
  assert.deepEqual(validate(c), c);
  assert.ok(validate({...context(), hour:23.75, baseCount:800, effectiveCount:800}));
});

test('invalid numeric, scope and layer data cannot become audience context', () => {
  for (const [key, value] of [
    ['hour', NaN], ['hour', Infinity], ['hour', -1], ['hour', 24], ['hour', '18'],
    ['baseCount', -1], ['baseCount', 801], ['baseCount', NaN],
    ['effectiveCount', 1.5], ['effectiveCount', Infinity], ['effectiveCount', -1],
    ['manual', 'false'], ['selection', 'unknown'], ['siteId', 'invented-site'],
  ]) assert.equal(validate({...context(), [key]:value}), null, `${key}: ${value}`);
  assert.equal(validate({...context(), mix:{familias:100,jovenes:100,turistas:0,seniors:0}}), null);
  assert.equal(validate({...context(), mix:{familias:NaN,jovenes:20,turistas:25,seniors:15}}), null);
  assert.equal(validate({...context(), layers:{crowd:true,buildings:true,roads:true}}), null);
  assert.equal(validate(null), null);
});

test('postMessage is accepted only from the intended window and exact origin', () => {
  const child = {}, otherWindow = {}, origin = 'https://admira.tv';
  const event = {origin, source:child, data:message('context', context())};
  assert.equal(accepts(event, child, origin), true);
  assert.equal(accepts({...event, origin:'https://admira.tv.evil.invalid'}, child, origin), false);
  assert.equal(accepts({...event, origin:'null'}, child, origin), false);
  assert.equal(accepts({...event, source:otherWindow}, child, origin), false);
  assert.equal(accepts({...event, data:{...event.data, version:2}}, child, origin), false);
  assert.equal(accepts({...event, data:{...event.data, channel:'other'}}, child, origin), false);
  assert.equal(accepts({...event, data:message('execute')}, child, origin), false);
  assert.equal(accepts({...event, data:message('context', {...context(), effectiveCount:NaN})}, child, origin), false);
  for (const type of ['ready', 'close', 'stop']) {
    assert.equal(accepts({...event, data:message(type)}, child, origin), true);
  }
});

test('historical BEST URLs open the universe and preserve explicit side/calibration intent', () => {
  assert.equal(bestEntry('', false), '../');
  const target = new URL(bestEntry('?side=panels&cal=1', false), 'https://admira.tv/adcelerate/demo/best/');
  assert.equal(target.pathname, '/adcelerate/demo/');
  assert.equal(target.searchParams.get('side'), 'panels');
  assert.equal(target.searchParams.get('cal'), '1');
  assert.equal(target.searchParams.get('view'), 'photo');
  assert.equal(bestEntry('?side=front', false), '../?side=front&view=photo');
});

test('only an explicit embedded BEST stays inside the child without redirect loops', () => {
  assert.equal(bestEntry('?embed=1&side=panels&cal=1', true), null);
  assert.equal(bestEntry('?embed=1', false), '../');
  assert.equal(bestEntry('', true), '../');
  assert.equal(bestEntry('?embed=0', true), '../');
});
