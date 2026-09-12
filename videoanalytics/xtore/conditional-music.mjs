import {XTORE_VIRTUAL_SCREEN} from './virtual-player.mjs';

// Carlos's local music choices, not an update to the public segmentation matrix.
// IDs verified in the public Pixeria index; URLs/types must still resolve there.
export const XTORE_MUSIC_ASSETS=Object.freeze({
  person:'1786533143983-n2y09e', // Berlin — Take My Breath Away (Top Gun).
  car:'1786532932584-a1412h', // Huey Lewis & The News — The Power Of Love.
  motorcycle:'1786532932584-a1412h',
  bicycle:'1786532932584-a1412h',
});
export function xtoreMusicRules(screen){
  if(screen!==XTORE_VIRTUAL_SCREEN)return null;
  return {
    target:XTORE_VIRTUAL_SCREEN,source:'xtore-local-music',
    rules:Object.entries(XTORE_MUSIC_ASSETS).map(([kind,id])=>({
      id:`xtore-music-${kind}`,kind,enabled:true,minCount:1,
      gender:'any',age:'any',slot:'any',category:'any',tag:'',medio:'any',
      assets:[id],musicOnly:true,conds:[],join:'and',
    })),
    default:{category:'any',tag:'',medio:'any'},
  };
}
