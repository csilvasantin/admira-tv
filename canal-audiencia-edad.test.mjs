// r66 · La edad desconocida del bus ya no se convierte en «adulto» (encargo #3355 de
// Morfeo · FLT-100491). Hasta r65, `AUD_AGE_MAP[age_band]||'adulto'` hacía que una
// persona sin clasificar emitiera contenido de adulto. Ahora manda decision.age_seg y
// lo que no se reconoce viaja como null: las reglas `age` no casan y decide el catch-all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} incompleta`);
}
const constSource = (name) => {
  const m = new RegExp(`^const ${name}=.*$`, 'm').exec(canal);
  assert.ok(m, `falta const ${name}`);
  return m[0];
};

const ctx = vm.createContext({});
vm.runInContext([
  constSource('AUD_AGE_MAP'), constSource('AUD_AGE_SEG'),
  constSource('AUD_KIND_ALIAS'), constSource('AUD_KIND_LANE'),
  functionSource(canal, 'audienceAge'), functionSource(canal, 'audienceRemoteLane'),
  'globalThis.edad=audienceAge; globalThis.carril=audienceRemoteLane;',
].join('\n'), ctx);

const bus = (label, decision) => ({ fresh: !!label, label, decision: decision || null });

test('manda decision.age_seg: es el vocabulario que casan las reglas de la matriz', () => {
  assert.equal(ctx.edad({ age_band: 'adult' }, { age_seg: 'vejez' }), 'vejez');
  assert.equal(ctx.edad({ age_band: 'child', age_seg: 'joven' }, null), 'joven', 'también vale en el label');
});

test('sin age_seg se traduce age_band, en inglés o en castellano', () => {
  assert.equal(ctx.edad({ age_band: 'elder' }, null), 'vejez');
  assert.equal(ctx.edad({ age_band: 'YOUTH' }, null), 'joven');
  assert.equal(ctx.edad({ age_band: 'senior' }, {}), 'senior');
});

test('lo que no se reconoce es null, NUNCA adulto', () => {
  for (const lab of [{ age_band: 'unknown' }, { age_band: '' }, { age_band: 'centenario' }, {}, null]) {
    assert.equal(ctx.edad(lab, null), null, `age_band ${JSON.stringify(lab)} no puede volverse adulto`);
  }
  assert.equal(ctx.edad({ age_band: 'unknown' }, { age_seg: null }), null);
  assert.equal(ctx.edad({ age_band: 'adult' }, { age_seg: 'ninguna' }), 'adulto', 'un age_seg inválido cae al age_band, no lo anula');
});

test('el carril de una persona clasificada lleva su franja', () => {
  const r = ctx.carril(bus({ kind: 'person', sex: 'f', age_band: 'adult', age_seg: 'adulto' }, { lane: 'TopGun', age_seg: 'adulto' }));
  assert.equal(r.present, true);
  assert.equal(r.lane, 'TopGun');
  assert.equal(r.age, 'adulto');
});

test('una persona sin edad sigue presente y con carril, pero sin franja', () => {
  const r = ctx.carril(bus({ kind: 'person', sex: 'm', age_band: 'unknown' }, { lane: 'Matrix' }));
  assert.equal(r.present, true);
  assert.equal(r.lane, 'Matrix');
  assert.equal(r.age, null, 'el hombre sin clasificar no se emite como adulto');
});

test('lo que no es persona nunca lleva edad, aunque el bus la mande', () => {
  const r = ctx.carril(bus({ kind: 'car', sex: 'u', age_band: 'joven' }, { lane: 'Coche', age_seg: 'joven' }));
  assert.equal(r.kind, 'car');
  assert.equal(r.age, null);
});

test('sin etiqueta fresca no hay presencia ni edad', () => {
  const r = ctx.carril({ fresh: false, label: null, decision: { lane: 'neutral' } });
  assert.equal(r.present, false);
  assert.equal(r.lane, 'neutral');
  assert.equal(r.age, null);
});

test('el default de adulto no vuelve a colarse en el consumidor del bus', () => {
  assert.doesNotMatch(canal, /AUD_AGE_MAP\[[^\]]*\]\s*\|\|\s*'adulto'/, 'r65 traducía a adulto por defecto');
  assert.match(canal, /window\.__xplCam=\{ faces:1, gender:r\.sex==='u'\?null:r\.sex, age:r\.age, kind:r\.kind, ts:now \};/);
});
