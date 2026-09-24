import test from 'node:test';
import assert from 'node:assert/strict';
import {dayRange,confirmedRows,summarize} from './model.mjs';
const envelope=rows=>({ok:true,camera:'puerta-cam',timezone:'Europe/Madrid',rows});
test('Madrid dates cover complete calendar days, including 23/25 hour DST days',()=>{
  for(const [day,hours,start] of [['2026-09-24',24,'2026-09-23T22:00:00Z'],['2026-03-29',23,'2026-03-28T23:00:00Z'],['2026-10-25',25,'2026-10-24T22:00:00Z']]){
    const r=dayRange(day);assert.equal(r.from,Date.parse(start));assert.equal(r.to-r.from,hours*3600000);
  }
  for(const day of ['2026-02-30','2026-2-3','bad','2026-13-01'])assert.equal(dayRange(day),null);
});
test('only confirmed camera rows in the requested day are accepted',()=>{
  const range=dayRange('2026-09-24'),row={hour:range.from,kind:'person',source:'detector',total:9};
  assert.deepEqual(confirmedRows(envelope([row]),range),[row]);
  for(const bad of [{...row,hour:range.to},{...row,total:-1},{...row,hour:range.from+1},{...row,kind:'avatar'},{...row,kind:'scooter'}])assert.equal(confirmedRows(envelope([bad]),range),null);
  assert.equal(confirmedRows(envelope([row,row]),range),null);
  assert.equal(confirmedRows({...envelope([]),camera:'other'},range),null);
});
test('people are not combined with vehicles or manual observations; filters are half open',()=>{
  const at=Date.parse('2026-09-24T10:00:00Z');
  const rows=[{hour:at,kind:'person',source:'detector',total:9},{hour:at,kind:'car',source:'detector',total:2},{hour:at,kind:'person',source:'manual',total:8},{hour:at+3600000,kind:'person',source:'detector',total:3}];
  const r=summarize(rows,12,13);assert.equal(r.counts.person,9);assert.equal(r.counts.car,2);assert.equal(r.manual,8);assert.equal(r.hours.length,1);
  assert.equal(summarize(rows,13,14).counts.person,3);assert.equal(summarize([],0,24).hasRecords,false);assert.equal(summarize(rows,13,12),null);
});
test('repeated autumn hours remain separate rows and both contribute to the local hour filter',()=>{
  const rows=['2026-10-25T00:00:00Z','2026-10-25T01:00:00Z'].map(s=>({hour:Date.parse(s),kind:'person',source:'detector',total:2}));
  assert.equal(summarize(rows,2,3).hours.length,2);assert.equal(summarize(rows,2,3).counts.person,4);
});
