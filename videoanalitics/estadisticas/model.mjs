import {dayKey} from '../../videoanalytics/xtore/history.mjs';
export const KINDS=['person','car','motorcycle','bicycle'];
const HOUR=3600000;
const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',hourCycle:'h23'});
export const hourOf=at=>Number(hourFormat.format(new Date(at)));
export function dayRange(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const utc=Date.parse(day+'T00:00:00Z');
  if(!Number.isFinite(utc)||new Date(utc).toISOString().slice(0,10)!==day)return null;
  // Madrid midnight is a whole UTC hour, including both DST transition days.
  const from=[utc-2*HOUR,utc-HOUR].find(at=>dayKey(at)===day&&hourOf(at)===0);
  const next=new Date(utc+24*HOUR).toISOString().slice(0,10);
  const to=[utc+22*HOUR,utc+23*HOUR].find(at=>dayKey(at)===next&&hourOf(at)===0);
  return Number.isFinite(from)&&Number.isFinite(to)?{from,to}:null;
}
export function confirmedRows(data,range){
  if(!data||data.ok!==true||data.camera!=='puerta-cam'||data.timezone!=='Europe/Madrid'||!Array.isArray(data.rows)||data.rows.length>250)return null;
  const seen=new Set();
  for(const r of data.rows){
    if(!r||!Number.isSafeInteger(r.hour)||r.hour%HOUR||r.hour<range.from||r.hour>=range.to||![...KINDS,'scooter'].includes(r.kind)||!['detector','manual'].includes(r.source)||r.kind==='scooter'&&r.source!=='manual'||!Number.isSafeInteger(r.total)||r.total<0)return null;
    const key=[r.hour,r.kind,r.source].join(':');if(seen.has(key))return null;seen.add(key);
  }
  return data.rows;
}
export function summarize(rows,start=0,end=24){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>24||start>=end)return null;
  const selected=rows.filter(r=>hourOf(r.hour)>=start&&hourOf(r.hour)<end);
  const counts=list=>Object.fromEntries(KINDS.map(kind=>[kind,list.filter(r=>r.kind===kind&&r.source==='detector').reduce((n,r)=>n+r.total,0)]));
  const manual=list=>list.filter(r=>r.source==='manual').reduce((n,r)=>n+r.total,0);
  return {counts:counts(selected),manual:manual(selected),hasRecords:selected.length>0,hours:[...new Set(selected.map(r=>r.hour))].sort((a,b)=>a-b).map(hour=>{
    const list=selected.filter(r=>r.hour===hour);return {hour,counts:counts(list),manual:manual(list)};
  })};
}
