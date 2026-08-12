import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const canal=fs.readFileSync('canal.html','utf8');
test('Payment solo se acepta del iframe interactivo en antena y por HTTPS',()=>{
  assert.match(canal,/event\.source!==f\.contentWindow/);
  assert.match(canal,/KIND\[it\.type\]!=='interactive'/);
  assert.match(canal,/if\(u\.protocol!=='https:'\) return/);
  assert.match(canal,/normTag\(t\)==='payment'/);
  assert.match(canal,/isPayment\?' allow-popups allow-popups-to-escape-sandbox'/);
  assert.match(canal,/d0\.event==='payment'/);
});
