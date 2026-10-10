import test from 'node:test';
import assert from 'node:assert/strict';
import { missingConfig, gifRpc, deliveryResult } from './core.mjs';
test('only a device trace success confirms delivery', () => {
  assert.equal(deliveryResult({code:200}).status, 'sent_to_bubble');
  assert.equal(deliveryResult({code:201}).status, 'uncertain');
  assert.equal(deliveryResult({code:408}).status, 'uncertain');
  assert.equal(deliveryResult({code:200,error:'failed'}).status, 'failed');
});
test('missing credentials and chat cannot advertise readiness', () => {
  assert.deepEqual(missingConfig({}), ['bridgeKey','botToken','chat']);
  assert.deepEqual(missingConfig({bridgeKey:'x',botToken:'y',chat:{}}), ['chat']);
});
test('GIF RPC rejects a foreign download and wrong dimensions', () => {
  const id='a'; const b=Buffer.from('47494638396120001000800000', 'hex');
  const job={id,kind:'gif',gif:b.toString('base64'),contentUrl:'https://playertaza.csilvasantin.workers.dev/api/iphone/content/a.gif'};
  assert.equal(gifRpc(job,'https://playertaza.csilvasantin.workers.dev').params.gifContent.size,13);
  assert.throws(()=>gifRpc({...job,contentUrl:'https://other.example/a.gif'},'https://playertaza.csilvasantin.workers.dev'));
  b.writeUInt16LE(64,6);
  assert.throws(()=>gifRpc({...job,gif:b.toString('base64')},'https://playertaza.csilvasantin.workers.dev'));
});
