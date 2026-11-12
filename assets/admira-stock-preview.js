(function(root){
  'use strict';
  // Las equivalencias se comprueban contra el canal, parrilla y servidor en tags-alias.test.mjs.
  const TAG_ALIAS={music:"musica",muscia:"musica",technology:"tecnologia",tech:"tecnologia",business:"negocio",creativity:"creatividad",ai:"ia",gaming:"videojuego",videojuegos:"videojuego",robotics:"robotica",historias:"historia",bebida:"bebidas",canciones:"cancion",robot:"robots",comics:"comic",curiosidad:"curiosidades",oferta:"ofertas",artistas:"artista",pelicula:"peliculas",personaje:"personajes",herramienta:"herramientas"};
  const MEDIA = new Set(['video','animation','image','digital-twin','audio','music','locucion','interactive']);
  function canonicalTag(value){
    const key=String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .trim().replace(/^#/,'').replace(/\s+/g,'-');
    return Object.hasOwn(TAG_ALIAS,key)?TAG_ALIAS[key]:key;
  }
  function supported(item){
    return !!(item&&item.id&&MEDIA.has(item.type)&&/^https?:\/\//i.test(item.url||''));
  }
  function match(items,query){
    const tags=query.split(/[,+]/).map(canonicalTag).filter(Boolean);
    const results=items.filter(item=>{
      if(!supported(item)) return false;
      const itemTags=(Array.isArray(item.tags)?item.tags:[]).map(canonicalTag);
      return tags.length>0&&tags.every(tag=>itemTags.includes(tag));
    });
    const newest=new Map();
    for(const item of results){
      const category=item.category||'~', date=String(item.createdAt||'');
      if(!newest.has(category)||date>newest.get(category)) newest.set(category,date);
    }
    return results.sort((a,b)=>{
      const categoryA=a.category||'~', categoryB=b.category||'~';
      return categoryA===categoryB
        ? String(b.createdAt||'').localeCompare(String(a.createdAt||''))
        : newest.get(categoryB).localeCompare(newest.get(categoryA));
    });
  }
  root.AdmiraStockPreview={match,supported};
})(typeof window==='undefined'?globalThis:window);
