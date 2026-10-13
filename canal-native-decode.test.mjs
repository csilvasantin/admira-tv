import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
const body=source.match(/function videoDecodeGuardWait\([\s\S]*?\n\}/)[0];
const wait=vm.runInNewContext('('+body+')');
test('blocked autoplay is not treated as a failed decoder; deadline remains bounded',()=>{
 const v={paused:true,_admiraAutoplayBlocked:true};
 assert.equal(wait(v,1000,0,4500),750);
 assert.equal(wait(v,1000,0,16000),0);
});
test('slow native start gets a decoding window measured from playing',()=>{
 const v={paused:false,_admiraPlaybackBeganAt:4000};
 assert.equal(wait(v,1000,0,4500),3000);
 assert.equal(wait(v,1000,0,7500),0);
});
test('visible frame callbacks and decoder counters both prove decoding',()=>{
 assert.equal(wait({_admiraDecodedFrameSeen:true},1000,0,20000),-1);
 assert.equal(wait({},1000,1,20000),-1);
});
test('genuine decode error or frame-less playback still falls back',()=>{
 assert.equal(wait({error:{code:3}},1000,0,4500),0);
 assert.equal(wait({paused:false},1000,0,4500),0);
});
