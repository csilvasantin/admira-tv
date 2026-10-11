// Encargo 5671 (demo Starbucks, 11-oct-2026): «hilo musical white-label sonando en el canal de la demo,
// sin marca Admira visible». Contrato: con ?marca=<cliente> la pestaña y el icono del canal dejan de decir
// Admira; sin el parámetro (o con marca=admira) todo queda como estaba.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const canal = readFileSync(new URL('./canal.html', import.meta.url), 'utf8');
const guion = /<title>Admira\.tv · Digital Signage Loop<\/title>\n<script>\n([\s\S]*?)<\/script>/.exec(canal);

function abre(search) {
  const icono = { href: '/favicon.svg' }, attrs = {};
  const document = { title: 'Admira.tv · Digital Signage Loop', documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    querySelector: () => icono };
  vm.runInNewContext(guion[1], { document, location: { search }, URLSearchParams });
  return { title: document.title, icono: icono.href, marca: attrs['data-marca'] };
}

test('el guion de marca va justo detrás del título, antes de que se pinte nada', () => {
  assert.ok(guion, 'falta el guion de marca blanca del canal');
});

test('con ?marca=starbucks la pestaña y el icono no dicen Admira', () => {
  const r = abre('?screen=x&clean=1&marca=starbucks');
  assert.equal(r.title, 'Starbucks · Canal');
  assert.equal(r.marca, 'starbucks');
  assert.doesNotMatch(r.title + r.icono, /admira|favicon/i);
});

test('marca compuesta se titula por palabras', () => {
  assert.equal(abre('?marca=clear-channel').title, 'Clear Channel · Canal');
});

test('sin marca, con marca=admira o con una marca inválida, el canal queda como estaba', () => {
  for (const q of ['', '?marca=admira', '?marca=Admira', '?marca=<script>', '?marca=']) {
    const r = abre(q);
    assert.equal(r.title, 'Admira.tv · Digital Signage Loop', q);
    assert.equal(r.icono, '/favicon.svg', q);
  }
});
