/* Audience source policy: GEOMEX is a fixed planning datum supplied for this demo. */
(function(root){
  'use strict';
  const GEOMEX_COUNT=54;
  const modes=['geomex','simulation'];
  function parse(search=''){
    const params=new URLSearchParams(search),value=params.get('audience')||params.get('mode');
    return value==='simulation'?'simulation':'geomex';
  }
  function counts(mode,baseCount,effectiveCount){
    if(mode==='geomex')return {baseCount:GEOMEX_COUNT,effectiveCount:GEOMEX_COUNT};
    return {baseCount,effectiveCount};
  }
  function valid(mode){return modes.includes(mode);}
  const api={GEOMEX_COUNT,modes,parse,counts,valid};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AudienceMode=api;
})(typeof globalThis!=='undefined'?globalThis:this);
