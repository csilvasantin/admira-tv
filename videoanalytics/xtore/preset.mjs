import {validRect,validQuad} from './core.mjs';

// Geometry only. Never store frames, stream IDs, tab titles, identities or permissions.
export const PRESET_KEY='admira.xtore.zapatillas.calibration.v1';
const LIMIT=4096;
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
const size=s=>Array.isArray(s)&&s.length===2&&s.every(n=>Number.isInteger(n)&&n>0&&n<=32768);
export function validPreset(p){
  return !!(keys(p,['version','savedAt','source','roi','tablet','signage'])&&p.version===1&&
    Number.isSafeInteger(p.savedAt)&&p.savedAt>0&&size(p.source)&&
    (p.roi===null||validRect(p.roi))&&(p.tablet===null||validQuad(p.tablet))&&
    (p.signage===null||validQuad(p.signage))&&(p.roi||p.tablet||p.signage));
}
export function compatiblePreset(p,source){
  // Coordinates are normalized. A proportional resolution change is safe to scale;
  // a different viewport aspect may have reflowed the scene and needs new marks.
  return validPreset(p)&&size(source)&&Math.abs((p.source[0]/p.source[1])/(source[0]/source[1])-1)<=.005;
}
export class CalibrationPresetStore{
  constructor(getStorage=()=>window.localStorage,now=()=>Date.now()){this.getStorage=getStorage;this.now=now;}
  read(){
    try{
      const raw=this.getStorage().getItem(PRESET_KEY);
      if(raw===null)return {state:'empty',preset:null};
      if(typeof raw!=='string'||raw.length>LIMIT)return {state:'invalid',preset:null};
      let preset;try{preset=JSON.parse(raw);}catch{return {state:'invalid',preset:null};}
      return validPreset(preset)?{state:'saved',preset}:{state:'invalid',preset:null};
    }catch{return {state:'unavailable',preset:null};}
  }
  save({source,roi=null,tablet=null,signage=null}){
    const preset={version:1,savedAt:this.now(),source,roi,tablet,signage};
    if(!validPreset(preset))return {state:'invalid',preset:null};
    try{const raw=JSON.stringify(preset);this.getStorage().setItem(PRESET_KEY,raw);return {state:'saved',preset:JSON.parse(raw)};}
    catch{return {state:'unavailable',preset:null};}
  }
  clear(){try{this.getStorage().removeItem(PRESET_KEY);return true;}catch{return false;}}
}
