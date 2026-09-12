import test from 'node:test';
import assert from 'node:assert/strict';
import {XTORE_MUSIC_ASSETS,xtoreMusicRules} from './conditional-music.mjs';
import {XTORE_VIRTUAL_SCREEN} from './virtual-player.mjs';

test('only the exact canonical virtual screen receives four explicit music choices',()=>{
  for(const screen of [undefined,'','xtanco-totem','virtual-other','xtore-virtual-other'])assert.equal(xtoreMusicRules(screen),null);
  const matrix=xtoreMusicRules(XTORE_VIRTUAL_SCREEN);
  assert.equal(matrix.target,XTORE_VIRTUAL_SCREEN);
  assert.deepEqual(matrix.rules.map(r=>r.kind),['person','car','motorcycle','bicycle']);
  assert.equal(XTORE_MUSIC_ASSETS.person,'1786533143983-n2y09e');
  for(const kind of ['car','motorcycle'])assert.equal(XTORE_MUSIC_ASSETS[kind],'1786532932584-a1412h');
  assert.equal(XTORE_MUSIC_ASSETS.bicycle,'1789214248874-j6qqjo');
  for(const rule of matrix.rules){
    assert.deepEqual(rule.assets,[XTORE_MUSIC_ASSETS[rule.kind]]);
    assert.equal(rule.minCount,1);assert.equal(rule.gender,'any');assert.equal(rule.age,'any');
    assert.equal(rule.enabled,true);assert.equal(rule.musicOnly,true);assert.deepEqual(rule.conds,[]);
    assert.equal(rule.startFraction,rule.kind==='bicycle'?0.5:undefined);
  }
  assert.equal(matrix.default.assets,undefined);assert.equal(matrix.default.tag,'');
});
test('matrix reads cannot mutate later rules and contain no media URL or editorial duration',()=>{
  const first=xtoreMusicRules(XTORE_VIRTUAL_SCREEN);first.rules[0].assets[0]='changed';first.default.tag='changed';
  const second=xtoreMusicRules(XTORE_VIRTUAL_SCREEN);
  assert.equal(second.rules[0].assets[0],XTORE_MUSIC_ASSETS.person);assert.equal(second.default.tag,'');
  assert.doesNotMatch(JSON.stringify(second),/https?:|duration|seconds|image|token/);
});
