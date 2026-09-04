import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('support exposes local-camera tester without embedding or autoplay',()=>{
 const html=readFileSync(new URL('./support/index.html',import.meta.url),'utf8');
 assert.match(html,/href="https:\/\/www.admira.live\/tester\/" target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(html,/getUserMedia|iframe[^>]*src="https:\/\/www.admira.live\/tester/);
});
test('public support card links to support workflow',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const card=html.match(/<article[^>]*data-public-app-card="support"[\s\S]*?<\/article>/)?.[0];
 assert.ok(card);assert.match(card,/href="\/support\/"/);
});
