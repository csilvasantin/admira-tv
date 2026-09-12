import test from 'node:test';
import assert from 'node:assert/strict';
import { emitirPase, verificarPase, firmar, b64urlDecode, emailsPermitidos, emailEnmascarado, PASE_TTL_S } from './_sso-pase.js';

const SECRET = 'a'.repeat(64);
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

test('emite un pase con el contrato fijo (v1, iss, aud, origen, exp = iat + 120 s, nonce 16 hex)', async () => {
  const { pase, exp } = await emitirPase(SECRET, { email: 'CSilva@admira.com', now: NOW });
  const [payload, firma] = pase.split('.');
  assert.ok(payload && firma && pase.split('.').length === 2);
  assert.doesNotMatch(pase, /[+/=]/, 'base64url sin +, / ni =');
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'email', 'exp', 'iat', 'iss', 'nonce', 'origen', 'v']);
  assert.equal(claims.v, 1);
  assert.equal(claims.email, 'csilva@admira.com');
  assert.equal(claims.iat, Math.floor(NOW / 1000));
  assert.equal(claims.exp, claims.iat + PASE_TTL_S);
  assert.equal(exp, claims.exp);
  assert.match(claims.nonce, /^[0-9a-f]{16}$/);
  assert.equal(claims.iss, 'admira.tv');
  assert.equal(claims.aud, 'admiranext.com');
  assert.equal(claims.origen, 'contentcatalogue');
  assert.equal(firma, await firmar(SECRET, payload), 'firma = base64url(HMAC-SHA256(secret, payload))');
});

test('la firma coincide con un HMAC-SHA256 de referencia (node:crypto)', async () => {
  const { createHmac } = await import('node:crypto');
  const { pase } = await emitirPase(SECRET, { email: 'csilvasantin@gmail.com', now: NOW });
  const [payload, firma] = pase.split('.');
  const ref = createHmac('sha256', SECRET).update(payload).digest('base64url');
  assert.equal(firma, ref);
});

test('verifica el pase dentro de los 2 minutos y lo rechaza después', async () => {
  const { pase } = await emitirPase(SECRET, { email: 'csilva@admira.com', now: NOW });
  const ok = await verificarPase(SECRET, pase, { now: NOW + 60_000 });
  assert.equal(ok.ok, true);
  assert.equal(ok.claims.email, 'csilva@admira.com');
  const tarde = await verificarPase(SECRET, pase, { now: NOW + 121_000 });
  assert.deepEqual(tarde, { ok: false, error: 'caducado' });
});

test('rechaza firma manipulada, otro secreto, otra audiencia y formato roto', async () => {
  const { pase } = await emitirPase(SECRET, { email: 'csilva@admira.com', now: NOW });
  const [payload, firma] = pase.split('.');
  assert.equal((await verificarPase('b'.repeat(64), pase, { now: NOW })).error, 'firma');
  const otraFirma = firma.slice(0, -1) + (firma.endsWith('A') ? 'B' : 'A');
  assert.equal((await verificarPase(SECRET, payload + '.' + otraFirma, { now: NOW })).error, 'firma');
  assert.equal((await verificarPase(SECRET, pase, { now: NOW, aud: 'otro.com' })).error, 'aud');
  assert.equal((await verificarPase(SECRET, 'sin-punto', { now: NOW })).error, 'formato');
  assert.equal((await verificarPase('', pase, { now: NOW })).error, 'sso_secret_missing');
  const manip = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  manip.email = 'intruso@x.com';
  const p2 = Buffer.from(JSON.stringify(manip)).toString('base64url');
  assert.equal((await verificarPase(SECRET, p2 + '.' + firma, { now: NOW })).error, 'firma');
});

test('lista blanca por defecto y por env, y email enmascarado', () => {
  const def = emailsPermitidos({});
  assert.ok(def.has('csilva@admira.com') && def.has('csilvasantin@gmail.com') && !def.has('otro@x.com'));
  const env = emailsPermitidos({ ADMIRA_SSO_EMAILS: ' Uno@A.com, dos@b.com ' });
  assert.ok(env.has('uno@a.com') && env.has('dos@b.com') && !env.has('csilva@admira.com'));
  assert.equal(emailEnmascarado('csilva@admira.com'), 'c***a@admira.com');
  assert.equal(emailEnmascarado('nada'), '');
});
