const {test}=require('node:test');
const assert=require('node:assert/strict');
const AudienceMode=require('../js/audience-mode.js');

test('GEOMEX is the default and always represents exactly 54 people',()=>{
  assert.equal(AudienceMode.parse(''), 'geomex');
  assert.equal(AudienceMode.parse('?audience=geomex'), 'geomex');
  assert.equal(AudienceMode.parse('?mode=geomex'), 'geomex');
  assert.deepEqual(AudienceMode.counts('geomex',460,322),{baseCount:54,effectiveCount:54});
});

test('simulation remains an explicit reversible mode with its own weather-adjusted count',()=>{
  assert.equal(AudienceMode.parse('?audience=simulation'), 'simulation');
  assert.deepEqual(AudienceMode.counts('simulation',460,322),{baseCount:460,effectiveCount:322});
  assert.equal(AudienceMode.valid('simulation'),true);
  assert.equal(AudienceMode.valid('other'),false);
});
