import test from 'node:test';
import assert from 'node:assert/strict';
import { addressedContent, completeFacts } from './functions/api/_playlist-live.js';

const devices = [
  { idIoT: 'Starbucks_PaseodeGracia_103_iPad_1', type: 'iPad', name: 'iPad', player: 'ipad-pg103' },
  { idIoT: 'Starbucks_PaseodeGracia_103_Pantalla_1', type: 'Pantalla', name: 'Menú', player: 'display-pg103' },
  { idIoT: 'Starbucks_PaseodeGracia_103_Altavoz_1', type: 'Altavoz', name: 'Altavoz', player: 'speaker-pg103' },
];
const shop = {
  project: 'starbucks', xpace: 'alsea-sbux-021', destinationIds: ['ipad-pg103', 'display-pg103', 'speaker-pg103', 'ipad-rc5'],
  xpaceName: 'Starbucks Paseo de Gracia 103', devices,
};
const ipad = { ...shop, screen: 'ipad-pg103', iot: devices[0].idIoT, name: 'iPad', w: 1080, h: 1920 };
const display = { ...shop, screen: 'display-pg103', iot: devices[1].idIoT, name: 'Menú', w: 1080, h: 1920 };
const speaker = { ...shop, screen: 'speaker-pg103', iot: devices[2].idIoT, name: 'Altavoz' };
const elsewhere = {
  project: 'starbucks', xpace: 'alsea-sbux-099', destinationIds: ['ipad-pg103', 'display-pg103', 'speaker-pg103', 'ipad-rc5'], xpaceName: 'Starbucks Rambla Catalunya 5',
  screen: 'ipad-rc5', name: 'iPad', iot: 'Starbucks_RamblaCatalunya_5_iPad_1',
  devices: [{ idIoT: 'Starbucks_RamblaCatalunya_5_iPad_1', type: 'iPad', player: 'ipad-rc5' }],
  w: 1080, h: 1920,
};
let sequence = 0;
const piece = (tags, extra = {}) => ({ id: String(++sequence), tags, type: 'video', title: 'Importada',
  url: 'https://stock.admira.store/stock/test/asset.mp4', createdAt: sequence, ...extra });
const receives = (p, facts) => addressedContent([p], facts).length === 1;

test('la marca sola alimenta todos sus players y excluye otras marcas', () => {
  const p = piece(['#starbucks']);
  for (const f of [ipad, display, elsewhere]) assert.equal(receives(p, f), true);
  assert.equal(receives(p, { ...ipad, project: 'otra-marca', iot: 'Otra_PaseodeGracia_103_iPad_1' }), false);
});

test('marca y local son una intersección: todos los players visuales de ese local', () => {
  const p = piece(['#starbucks', '#paseodegracia103']);
  assert.equal(receives(p, ipad), true);
  assert.equal(receives(p, display), true);
  assert.equal(receives(p, elsewhere), false);
});

test('marca, local y dispositivo sólo llegan al iPad registrado del local', () => {
  for (const tags of [
    ['#starbucks', '#paseodegracia103', '#ipad'],
    ['#starbuck', '#paseodegracia103', '#ipad'],
    ['#starbucks #paseodegracia103 #ipad'],
  ]) {
    const p = piece(tags);
    assert.equal(receives(p, ipad), true, JSON.stringify(tags));
    assert.equal(receives(p, display), false);
    assert.equal(receives(p, elsewhere), false);
  }
});

test('el id de player exacto permite seleccionar el equipo sin inferir su tipo', () => {
  const p = piece(['starbucks', 'paseodegracia103', 'ipad-pg103']);
  assert.equal(receives(p, ipad), true);
  assert.equal(receives(p, display), false);
});

test('locales, equipos y nombres desconocidos nunca degradan a difusión de marca', () => {
  for (const tags of [
    ['starbucks', 'unknownshop'],
    ['starbucks', 'paseodegracia103', 'unknowndevice'],
    ['starbucks', 'ramblacatalunya5'],
    ['starbucks', 'paseodegracia103', 'pantalla'],
    ['starbucks', 'Starbucks_RamblaCatalunya_5_iPad_1'],
  ]) assert.equal(receives(piece(tags), ipad), false, JSON.stringify(tags));
  assert.equal(receives(piece(['ipad']), ipad), false, 'un tipo corto sin ámbito no es un destino global');
});

test('las etiquetas temáticas conocidas acompañan el destino sin ampliarlo', () => {
  const p = piece(['starbucks', 'paseodegracia103', 'ipad', 'cafe', 'bebidas']);
  assert.equal(receives(p, ipad), true);
  assert.equal(receives(p, display), false);
  assert.equal(receives(p, elsewhere), false);
});

test('un tipo ambiguo requiere un identificador de equipo completo', () => {
  const duplicate = { ...ipad, devices: [...devices,
    { idIoT: 'Starbucks_PaseodeGracia_103_iPad_2', type: 'iPad', name: 'iPad', player: 'ipad-pg103-2' }],
  };
  assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad']), duplicate), false);
  assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad-pg103']), duplicate), true);
});

test('el centro puede resolverse del nombre del registro sin idIoT', () => {
  const f = completeFacts({ screen: 'registered-pg103' }, { registry: {
    'registered-pg103': { p: 'starbucks', x: 'alsea-sbux-021', n: 'iPad', xn: 'Starbucks Paseo de Gracia 103' },
  } });
  assert.equal(receives(piece(['starbucks', 'paseodegracia103']), f), true);
  assert.equal(receives(piece(['starbucks', 'ramblacatalunya5']), f), false);
});

test('completeFacts conserva el inventario local necesario para resolver unicidad', () => {
  const f = completeFacts({ screen: 'ipad-pg103', xpace: 'alsea-sbux-021' }, {
    xpaceRecord: { id: 'alsea-sbux-021', name: 'Starbucks Paseo de Gracia 103', project: 'starbucks', iot: devices },
    registry: { 'ipad-pg103': { p: 'starbucks', x: 'alsea-sbux-021', n: 'iPad', xn: 'Starbucks Paseo de Gracia 103' } },
  });
  assert.equal(f.name, 'iPad');
  assert.deepEqual(f.devices, devices);
  assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad']), f), true);
});

test('el hashtag compuesto legado sigue siendo exacto aunque acompañe la marca', () => {
  const p = piece(['starbucks', 'starbucks_paseodegracia_103_ipad1']);
  assert.equal(receives(p, ipad), true);
  assert.equal(receives(p, display), false);
  assert.equal(receives(p, elsewhere), false);
  const centre = piece(['starbucks_paseodegracia_103']);
  assert.equal(receives(centre, display), true);
  assert.equal(receives(centre, elsewhere), false);
});

test('marca y centro conservan audio por altavoz, y el equipo exacto admite su audio', () => {
  const broadAudio = piece(['starbucks', 'paseodegracia103'], { type: 'audio', url: 'https://stock.admira.store/test.mp3' });
  assert.equal(receives(broadAudio, speaker), true);
  assert.equal(receives(broadAudio, ipad), false);
  const deviceAudio = piece(['starbucks', 'paseodegracia103', 'ipad'], { type: 'music', url: 'https://stock.admira.store/test.mp3' });
  assert.equal(receives(deviceAudio, ipad), true);
  assert.equal(receives(deviceAudio, speaker), false);
});

test('los nuevos destinos respetan ocultación, vigencia, orientación y URL segura', () => {
  for (const extra of [
    { oculto: true }, { catalogo: { hasta: '2020-01-01' } },
    { url: 'http://stock.admira.store/test.mp4' }, { orientacion: 'horizontal' },
  ]) assert.equal(receives(piece(['starbucks', 'paseodegracia103'], extra), ipad), false, JSON.stringify(extra));
  assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad'], { orientacion: 'horizontal' }), ipad), true,
    'el equipo exacto mantiene la semántica del destino legado');
});

test('un destino compuesto de centro también respeta todos los calificadores adicionales', () => {
  for (const tags of [
    ['starbucks_paseodegracia_103', 'starbucks', 'paseodegracia999'],
    ['starbucks_paseodegracia_103', 'starbucks', 'unknownshop'],
    ['starbucks_paseodegracia_103', 'starbucks', 'starbuckspaseodegracia103pantalla2'],
    ['starbucks_paseodegracia_103', 'starbucks', 'starbucks_paseodegracia_103_pantalla2'],
  ]) assert.equal(receives(piece(tags), ipad), false, JSON.stringify(tags));
});

test('una identidad de marca en conflicto no convierte el equipo en dos marcas', () => {
  const conflict = { ...ipad, project: 'mcdonalds' };
  assert.equal(receives(piece(['starbucks']), conflict), false,
    'un conflicto de identidad bloquea la ruta hasta corregirlo');
  assert.equal(receives(piece(['mcdonalds']), conflict), false);
});

test('la unicidad del alias usa tanto el tipo de inventario como el tipo del idIoT', () => {
  const duplicate = { ...ipad, devices: [
    { idIoT: 'Starbucks_PaseodeGracia_103_iPad_1', type: 'Tablet', name: 'iPad', player: 'ipad-pg103' },
    { idIoT: 'Starbucks_PaseodeGracia_103_iPad_2', type: 'Tablet', name: 'iPad', player: 'ipad-pg103-2' },
  ] };
  assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad']), duplicate), false);
  assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad-pg103']), duplicate), true);
});

test('un alias corto exige inventario local confirmado; el ID completo sigue siendo seguro', () => {
  for (const inventory of [undefined, []]) {
    const f = { ...ipad, devices: inventory };
    assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad']), f), false);
    assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad-pg103']), f), true);
  }
});

test('los nombres duplicados también vuelven ambiguo un alias de dispositivo', () => {
  for (const name of ['iPad', 'Barra']) {
    const f = { ...ipad, name, devices: [
      { idIoT: 'Starbucks_PaseodeGracia_103_Pantalla_1', type: 'Pantalla', name, player: 'ipad-pg103' },
      { idIoT: 'Starbucks_PaseodeGracia_103_Pantalla_2', type: 'Pantalla', name, player: 'display-pg103' },
    ] };
    assert.equal(receives(piece(['starbucks', 'paseodegracia103', name]), f), false, name);
    assert.equal(receives(piece(['starbucks', 'paseodegracia103', 'ipad-pg103']), f), true);
  }
});

test('los hashtags explícitos de comentarios funcionan con etiquetas temáticas automáticas libres', () => {
  const p = piece(['viral', 'youtube', 'cold-brew', 'vlog'], {
    comment: 'Oferta para hoy. #starbucks #paseodegracia103 #ipad',
  });
  assert.equal(receives(p, ipad), true);
  assert.equal(receives(p, display), false);
  assert.equal(receives(p, elsewhere), false);
});

test('un hashtag explícito desconocido bloquea aunque el comentario tenga una ruta válida', () => {
  for (const extra of [
    { tags: ['viral'], comment: '#starbucks #paseodegracia103 #ipad #unknowndevice' },
    { tags: ['viral', '#unknownshop'], comment: '#starbucks #paseodegracia103 #ipad' },
  ]) assert.equal(receives(piece(extra.tags, { comment: extra.comment }), ipad), false);
});

test('el comentario no elimina direcciones completas ajenas ya guardadas en tags', () => {
  for (const target of ['Starbucks_RamblaCatalunya_5_iPad_1', 'starbucks_paseodegracia_103_pantalla2']) {
    const p = piece([target, 'viral'], { comment: '#starbucks #paseodegracia103 #ipad' });
    assert.equal(receives(p, ipad), false, target);
  }
});

test('añadir un comentario de marca no amplía una pieza con ID de player guardado', () => {
  const p = piece(['ipad-pg103'], { comment: '#starbucks' });
  assert.equal(receives(p, ipad), true);
  assert.equal(receives(p, display), false);
  assert.equal(receives(p, elsewhere), false);
});

const movedScreen = 'ipad-admin-mupi';
const movedIot = 'Starbucks_PaseodeGracia_103_iPad_1';
const staleIndex = {
  [movedScreen]: { x: 'ipad-admin', n: 'iPad de administración', c: 'admiranext', b: 'admiranext', i: 'AdmiraNeXT_iPaddeAdmin_Pantalla_1' },
};
const canonicalLocation = {
  id: 'alsea-sbux-021', name: 'Starbucks Paseo de Gracia 103', circuit: 'alsea_starbucks', project: 'starbucks',
  addr: 'Paseo de Gracia 103',
  iot: [{ idIoT: movedIot, type: 'iPad', name: 'iPad', player: movedScreen }],
};

test('tras trasladar un player, la ficha del Xpacio registrado gana al índice antiguo', () => {
  const f = completeFacts({ screen: movedScreen }, {
    xpaceIndex: staleIndex,
    registry: { [movedScreen]: { p: 'starbucks', x: 'alsea-sbux-021', n: 'iPad', xn: canonicalLocation.name } },
    xpaceRecord: canonicalLocation,
  });
  assert.equal(f.xpace, 'alsea-sbux-021');
  assert.equal(f.project, 'starbucks');
  assert.equal(f.iot, movedIot);
  assert.equal(f.circuit, 'alsea_starbucks');
  assert.equal(f.xpaceName, canonicalLocation.name);
  assert.equal(receives(piece([], { comment: '#starbucks #paseodegracia103 #ipad' }), f), true);
});

test('un Xpacio declarado con ficha canónica nunca hereda el idIoT de otro Xpacio', () => {
  const f = completeFacts({ screen: movedScreen, xpace: 'alsea-sbux-021' }, {
    xpaceIndex: staleIndex, xpaceRecord: canonicalLocation,
  });
  assert.equal(f.project, 'starbucks');
  assert.equal(f.iot, movedIot);
  assert.equal(receives(piece([], { comment: '#starbucks #paseodegracia103 #ipad' }), f), true);
});

test('sin asociación de equipo en la ficha nueva se descarta el idIoT del índice de otro local', () => {
  const f = completeFacts({ screen: movedScreen, xpace: 'alsea-sbux-021' }, {
    xpaceIndex: staleIndex, xpaceRecord: { ...canonicalLocation, iot: [] },
  });
  assert.equal(f.project, 'starbucks');
  assert.equal(f.iot, undefined);
  assert.equal(receives(piece([], { comment: '#starbucks #paseodegracia103 #ipad' }), f), false,
    'sin equipo asociado no se puede inferir un iPad único del local');
});

test('etiquetas inferidas de búsqueda nunca se convierten en destinos de emisión', () => {
  const searchOnly = piece(['starbucks', 'paseodegracia103', 'música', '1982'], {routingTags:[]});
  for (const f of [ipad, display, elsewhere]) assert.equal(receives(searchOnly,f),false);
  const directed = piece(['starbucks','música','1982','otra-marca'], {routingTags:['starbucks','paseodegracia103','ipad']});
  assert.equal(receives(directed,ipad),true); assert.equal(receives(directed,display),false); assert.equal(receives(directed,elsewhere),false);
});

test('reimportar un legado conserva su dirección anterior aunque se infiera otra marca',()=>{
 const p=piece(['starbucks','paseodegracia103','1982','música','otra-marca'],{comment:'#starbucks #paseodegracia103 #ipad',routingSource:{tags:['starbucks','paseodegracia103','ipad'],comment:'#starbucks #paseodegracia103 #ipad'}});
 assert.equal(receives(p,ipad),true);assert.equal(receives(p,display),false);assert.equal(receives(p,elsewhere),false);
});

test('contrato del importador: la nota con destino y una etiqueta manual temática mantienen el reparto',()=>{
 const p=piece(['starbucks','paseodegracia103','ipad','favorito','música','1982'],{comment:'music top songs 1982 #starbucks #paseodegracia103 #ipad',routingSource:{tags:['favorito'],comment:'music top songs 1982 #starbucks #paseodegracia103 #ipad'}});
 assert.equal(receives(p,ipad),true);assert.equal(receives(p,display),false);assert.equal(receives(p,elsewhere),false);
});
