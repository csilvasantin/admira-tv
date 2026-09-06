/* Verified outdoor destinations. Audience origin is independent of photo navigation. */
(function(root){
  'use strict';
  const sites=[{
    id:'vila',name:'Quiosco News & Coffee',area:'Vila de Gràcia',shortLabel:'Vila de Gràcia',targetLabel:'Quiosco',
    position:{lat:41.4002641,lng:2.1573332},audienceSiteId:'bcn-kiosk-016',
    inventoryLabel:'Soporte identificado · OOH Media',
    entry:{pano:'2NoSvJbqMCZ0RXhR8pTSLA',pov:{heading:49.5,pitch:2,zoom:.9}},
    front:{pano:'9xunlB_EXfx7QBkGq7cZfA',pov:{heading:238.13,pitch:2,zoom:0}}
  },{
    id:'jardinets',name:'Quiosco de Jardinets',area:'Plaça de Nicolás Salmerón · Jardinets',shortLabel:'Jardinets',targetLabel:'Punto de visita',
    // Street View camera position, verified against the requested photograph.
    // It is not an inventoried coordinate of the physical advertising support.
    position:{lat:41.397772717774245,lng:2.1576335976146668},audienceSiteId:null,
    inventoryLabel:'QUIOSCO · JARDINETS',
    entry:{pano:'L6xcO37SQfBmCxsT9lPdjQ',pov:{heading:290,pitch:-6,zoom:.9}},front:null
  }];
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  freeze(sites);
  const get=id=>sites.find(site=>site.id===id)||null;
  const next=id=>{const index=sites.findIndex(site=>site.id===id);return sites[index<0?0:(index+1)%sites.length];};
  const api={all:sites,get,next};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OutdoorSites=api;
})(typeof globalThis!=='undefined'?globalThis:this);
