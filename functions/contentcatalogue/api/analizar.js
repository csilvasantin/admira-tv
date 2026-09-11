// POST /contentcatalogue/api/analizar — lee páginas de un folleto (imágenes) y
// devuelve los productos que aparecen, con el mismo esquema que los catálogos de
// /contentcatalogue/catalogos/*.json. Patrón calcado de admiranext.com
// (presentaciones/api/video-reference.js + ad-idea.js): validación de data URLs,
// límites de tamaño, llamada a xAI /v1/responses con json_schema estricto.
//
// Cuerpo:      {pages:[{n:<nº de página>, image:"data:image/jpeg;base64,…"}]}
// Respuesta:   {ok:true, productos:[{p, seccion, nombre, marca, detalle, precio, unidad, promo, precio_texto, precio_verificado}]}
// Clave:       XAI_API_KEY (wrangler pages secret put XAI_API_KEY --project-name admira-tv)
//
// Los precios se contrastan: el modelo devuelve el precio tal como lo LEE en la
// página («6,99») además del número; si el texto no tiene forma de precio español
// (\d+,\d{2}) o no cuadra con el número, el número se descarta (null) y el producto
// queda marcado como no verificado. Antes que inventar un precio, se deja vacío.

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_PROVIDER_BYTES = 256 * 1024;
const MAX_IMAGE_CHARS = 1800 * 1024;
const MAX_PAGES = 4;
const MAX_PRODUCTS_PER_PAGE = 60;
const DATA_IMAGE_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PRECIO_RE = /^\d{1,4},\d{2}$/;

function json(payload, status = 200){
  return Response.json(payload, {status, headers:{
    'cache-control':'no-store',
    'content-type':'application/json; charset=utf-8',
    'x-content-type-options':'nosniff'
  }});
}

function sameOrigin(request){
  const origin = request.headers.get('origin');
  if(!origin) return true;
  try{ return new URL(origin).origin === new URL(request.url).origin; }
  catch(_){ return false; }
}

function clean(value, maxLength = 200){
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

async function readJsonLimited(source, maxBytes){
  const declared = Number(source.headers.get('content-length') || 0);
  if(declared > maxBytes) throw new Error('body_too_large');
  if(!source.body) throw new Error('body_empty');
  const reader = source.body.getReader();
  const chunks = [];
  let total = 0;
  try{
    while(true){
      const {done, value} = await reader.read();
      if(done) break;
      total += value.byteLength;
      if(total > maxBytes){ await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  }finally{ reader.releaseLock(); }
  if(!total) throw new Error('body_empty');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for(const chunk of chunks){ bytes.set(chunk, offset); offset += chunk.byteLength; }
  try{ return JSON.parse(new TextDecoder().decode(bytes)); }
  catch(_){ throw new Error('json_invalid'); }
}

function outputText(payload){
  return payload?.output
    ?.find(item => item?.type === 'message')
    ?.content?.find(item => item?.type === 'output_text')?.text;
}

function providerMessage(status){
  if(status === 401 || status === 403) return 'La conexión visual con Grok no está autorizada.';
  if(status === 429) return 'Grok está ocupado. Prueba de nuevo en unos segundos.';
  if(status >= 500) return 'Grok no está disponible temporalmente.';
  return 'Grok no pudo leer el folleto.';
}

// Verificación de precios: el número sólo se acepta si el texto leído en la página
// tiene forma de precio (\d+,\d{2}) y coincide con él (tolerancia de 1 céntimo).
function verificaPrecio(precio, texto){
  const t = clean(texto, 16).replace(/\s*€\s*$/, '').replace('.', ',');
  const m = t.match(/\d{1,4},\d{2}/);
  if(!m || !PRECIO_RE.test(m[0])) return {precio:null, precio_texto:t, precio_verificado:false};
  const leido = Number(m[0].replace(',', '.'));
  if(typeof precio !== 'number' || !isFinite(precio) || Math.abs(precio - leido) > 0.011){
    return {precio:leido, precio_texto:m[0], precio_verificado:false};
  }
  return {precio:Math.round(leido * 100) / 100, precio_texto:m[0], precio_verificado:true};
}

function publicProducto(candidate, n){
  const nombre = clean(candidate?.nombre, 140);
  if(!nombre) return null;
  const v = verificaPrecio(candidate?.precio, candidate?.precio_texto);
  const unidad = clean(candidate?.unidad, 12) || 'ud';
  const out = {
    p:n,
    seccion:clean(candidate?.seccion, 60) || 'Sin sección',
    nombre,
    marca:clean(candidate?.marca, 60),
    detalle:clean(candidate?.detalle, 160),
    precio:v.precio,
    unidad,
    promo:clean(candidate?.promo, 160),
    precio_texto:v.precio_texto,
    precio_verificado:v.precio_verificado
  };
  if(!out.marca) delete out.marca;
  if(!out.detalle) delete out.detalle;
  if(!out.promo) delete out.promo;
  return out;
}

const SCHEMA = {
  type:'object',
  additionalProperties:false,
  properties:{
    productos:{
      type:'array',
      items:{
        type:'object',
        additionalProperties:false,
        properties:{
          nombre:{type:'string'},
          marca:{type:'string'},
          detalle:{type:'string'},
          precio:{type:['number','null']},
          precio_texto:{type:'string'},
          unidad:{type:'string'},
          promo:{type:'string'},
          seccion:{type:'string'}
        },
        required:['nombre','marca','detalle','precio','precio_texto','unidad','promo','seccion']
      }
    }
  },
  required:['productos']
};

const SYSTEM = 'Eres un lector de folletos de supermercado en español. Recibes la imagen de UNA página y devuelves SOLO JSON con todos los productos con precio visible. Por producto: nombre (tal como aparece, con la marca dentro si forma parte del nombre), marca (o cadena vacía), detalle (formato, peso, número de unidades, precio por kilo entre paréntesis si se ve; cadena vacía si no hay), precio (número con dos decimales, el precio principal en euros; null si no se lee con claridad), precio_texto (el precio EXACTAMENTE como está impreso, p. ej. "6,99"; cadena vacía si no hay), unidad ("ud", "€/kg", "€/l", "pack"…), promo (texto de la oferta: "2x1", "2ª unidad al 50%", "Club Alcampo", "a partir del…"; cadena vacía si no hay), seccion (el rótulo de sección de la página: "Pescadería", "Lácteos", "Bebidas"…). No inventes productos ni precios: si algo no se lee, deja el precio en null y el texto vacío. No repitas un mismo producto.';

async function leerPagina(page, env){
  const response = await fetch('https://api.x.ai/v1/responses', {
    method:'POST',
    headers:{'content-type':'application/json', authorization:`Bearer ${env.XAI_API_KEY}`},
    body:JSON.stringify({
      model:env.XAI_VISION_MODEL || env.XAI_TEXT_MODEL || 'grok-4.5',
      store:false,
      input:[
        {role:'system', content:[{type:'input_text', text:SYSTEM}]},
        {role:'user', content:[
          {type:'input_text', text:`Página ${page.n} del folleto. Extrae todos los productos con su precio.`},
          {type:'input_image', image_url:page.image, detail:'high'}
        ]}
      ],
      text:{format:{type:'json_schema', name:'productos_folleto', strict:true, schema:SCHEMA}}
    })
  });
  if(!response.ok) throw Object.assign(new Error('provider'), {status:response.status});
  const declared = Number(response.headers.get('content-length') || 0);
  if(declared > MAX_PROVIDER_BYTES) throw new Error('provider_too_large');
  const payload = await readJsonLimited(response, MAX_PROVIDER_BYTES);
  const parsed = JSON.parse(outputText(payload) || '');
  const lista = Array.isArray(parsed?.productos) ? parsed.productos.slice(0, MAX_PRODUCTS_PER_PAGE) : [];
  return lista.map(c => publicProducto(c, page.n)).filter(Boolean);
}

export async function onRequest(context){
  const {request, env} = context;
  // GET = sonda: la UI pregunta si el análisis IA está configurado antes de ofrecerlo.
  if(request.method === 'GET') return json({ok:true, configured:Boolean(env.XAI_API_KEY), maxPages:MAX_PAGES, modelo:env.XAI_VISION_MODEL || env.XAI_TEXT_MODEL || 'grok-4.5'});
  if(request.method !== 'POST') return json({error:'Método no permitido.'}, 405);
  if(!sameOrigin(request)) return json({error:'Origen no permitido.'}, 403);
  if(!env.XAI_API_KEY) return json({error:'Análisis IA no configurado: falta XAI_API_KEY en el proyecto Pages.', configured:false}, 503);

  let body;
  try{ body = await readJsonLimited(request, MAX_REQUEST_BYTES); }
  catch(error){
    const grande = error.message === 'body_too_large';
    return json({error:grande ? 'Las páginas superan el tamaño permitido (máx. 6 MB por petición).' : 'No pudimos leer las páginas del folleto: envía {pages:[{n, image}]}.'}, grande ? 413 : 400);
  }
  const pages = Array.isArray(body?.pages) ? body.pages : [];
  if(!pages.length || pages.length > MAX_PAGES) return json({error:`Envía entre 1 y ${MAX_PAGES} páginas por petición.`}, 400);
  for(const page of pages){
    const n = Number(page?.n);
    if(!Number.isInteger(n) || n < 1 || n > 999) return json({error:'Cada página necesita su número (n).'}, 400);
    if(typeof page?.image !== 'string' || page.image.length > MAX_IMAGE_CHARS || !DATA_IMAGE_RE.test(page.image)){
      return json({error:`La página ${n} no es una imagen JPEG, PNG o WebP válida (máx. ~1,3 MB).`}, 415);
    }
  }

  const resultados = await Promise.allSettled(pages.map(page => leerPagina({n:Number(page.n), image:page.image}, env)));
  const productos = [];
  const errores = [];
  resultados.forEach((r, i) => {
    if(r.status === 'fulfilled') productos.push(...r.value);
    else errores.push({p:Number(pages[i].n), error:r.reason?.status ? providerMessage(r.reason.status) : 'Grok no devolvió un listado válido.'});
  });
  if(!productos.length && errores.length){
    const status = errores.some(e => /ocupado/.test(e.error)) ? 429 : 502;
    return json({error:errores[0].error, errores}, status);
  }
  return json({ok:true, productos, errores, modelo:env.XAI_VISION_MODEL || env.XAI_TEXT_MODEL || 'grok-4.5'});
}
