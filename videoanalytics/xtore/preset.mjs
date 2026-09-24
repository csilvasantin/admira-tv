import {validDirectionAxis} from './audience-session.mjs';
import {validRect,validQuad} from './core.mjs';

// Geometry only. Never store frames, stream IDs, tab titles, identities or permissions.
export const PRESET_KEY='admira.xtore.zapatillas.calibration.v1';
const LIMIT=32768;
export const PRESET_HISTORY_LIMIT=12;
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
const size=s=>Array.isArray(s)&&s.length===2&&s.every(n=>Number.isInteger(n)&&n>0&&n<=32768);
export function validPreset(p){
  return !!(keys(p,['version','savedAt','source','roi','tablet','signage','directionAxis'])&&p.version===1&&(p.directionAxis===undefined||validDirectionAxis(p.directionAxis))&&
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
  read(source){
    try{
      const raw=this.getStorage().getItem(PRESET_KEY);
      if(raw===null)return {state:'empty',preset:null,presets:[]};
      if(typeof raw!=='string'||raw.length>LIMIT)return {state:'invalid',preset:null,presets:[]};
      let value;try{value=JSON.parse(raw);}catch{return {state:'invalid',preset:null,presets:[]};}
      // Upgrade the original single preset on the next successful save.
      const presets=validPreset(value)?[value]:keys(value,['version','presets'])&&value.version===2&&
        Array.isArray(value.presets)&&value.presets.length>0&&value.presets.length<=PRESET_HISTORY_LIMIT&&value.presets.every(validPreset)?value.presets:null;
      if(!presets)return {state:'invalid',preset:null,presets:[]};
      return {state:'saved',preset:(source&&presets.find(p=>compatiblePreset(p,source)))||presets[0],presets};
    }catch{return {state:'unavailable',preset:null,presets:[]};}
  }
  save({source,roi=null,tablet=null,signage=null,directionAxis}){
    const preset={version:1,savedAt:this.now(),source,roi,tablet,signage,...(directionAxis?{directionAxis}: {})};
    if(!validPreset(preset))return {state:'invalid',preset:null,presets:[]};
    // One atomic write: a partial/new-format mark never deletes the previous
    // complete framing. Identical geometry does not consume another history slot.
    const geometry=p=>JSON.stringify([p.source,p.roi,p.tablet,p.signage,p.directionAxis]);
    const previous=this.read().presets;
    const presets=[preset,...previous.filter(p=>geometry(p)!==geometry(preset))].slice(0,PRESET_HISTORY_LIMIT);
    try{
      const raw=JSON.stringify({version:2,presets});
      this.getStorage().setItem(PRESET_KEY,raw);
      const saved=JSON.parse(raw).presets;
      return {state:'saved',preset:saved[0],presets:saved};
    }catch{return {state:'unavailable',preset:null,presets:[]};}
  }
  clear(){try{this.getStorage().removeItem(PRESET_KEY);return true;}catch{return false;}}
}
