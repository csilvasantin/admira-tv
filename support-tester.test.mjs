import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('support exposes local-camera tester without embedding or autoplay',()=>{
 const html=readFileSync(new URL('./support/index.html',import.meta.url),'utf8');
 assert.match(html,/href="\/tester\/" target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(html,/getUserMedia|iframe[^>]*src="https:\/\/www.admira.live\/tester/);
});
test('tester is hosted on Admira.tv with private camera policy and local assets',()=>{
 const html=readFileSync(new URL('./tester/index.html',import.meta.url),'utf8');
 const headers=readFileSync(new URL('./_headers',import.meta.url),'utf8');
 assert.match(html,/<title>Tester visual · Admira.tv<\/title>/);
 assert.match(html,/src="\.\/tester.js"/);
 assert.match(html,/href="https:\/\/www.admira.live\/control\/"/);
 assert.doesNotMatch(html,/http-equiv="refresh"|<iframe|auth-gate/);
 assert.match(headers,/\/tester\/\*[\s\S]*camera=\(self\), microphone=\(\)/);
 assert.match(headers,/connect-src 'none'/);
});
test('public support card links to support workflow',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const card=html.match(/<article[^>]*data-public-app-card="support"[\s\S]*?<\/article>/)?.[0];
 assert.ok(card);assert.match(card,/href="\/support\/"/);
});
