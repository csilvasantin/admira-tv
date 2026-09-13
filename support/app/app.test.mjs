import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cms = readFileSync(new URL('../../cms.html', import.meta.url), 'utf8');

test('CSO copy in P1 P2 P3', () => {
  assert.match(app, /La flota no grita: entra en cola/);
  assert.match(app, /No vas al ticket: entras en la pantalla/);
  assert.match(app, /Se cierra con valor, no con .cerrado/);
  assert.match(landing, /La flota no grita: entra en cola/);
  assert.match(landing, /No vas al ticket: entras en la pantalla/);
  assert.match(landing, /Se cierra con valor, no con/);
});

test('single app, FLT refs, canonical /support/app/', () => {
  assert.match(app, /FLT-100395 \/ FLT-100396/);
  assert.match(html, /canonical" href="https:\/\/admira.tv\/support\/app\/"/);
  assert.match(html, /auth-gate\.js/);
  assert.match(app, /view === 'sala'/);
  assert.match(app, /view === 'parte'/);
  assert.match(css, /--accent:#39ff14/);
});

test('Asistencia never leaves an empty sala', () => {
  assert.match(app, /ensureSala/);
  assert.match(app, /source: source \|\| 'asistencia_click'/);
  assert.match(app, /Falta playerId o incidentId/);
  assert.match(cms, /\/support\/app\/\?view=sala&source=asistencia_click&playerId=/);
  assert.doesNotMatch(cms, /sala vacía/);
  assert.doesNotMatch(cms, /yokup.com\/asistencia\?room=/);
});

test('landing embeds first-party gestor not Yokup tool', () => {
  assert.match(landing, /SRC='\/support\/app\/'/);
  assert.doesNotMatch(landing, /yokup.com\/tool/);
  assert.match(landing, /CAE → SE ASIGNA → SE CIERRA/);
});

test('P3 cierra con valor, no con cerrado a ciegas', () => {
  assert.match(app, /El cierre es con valor: elige 1–5/);
  assert.match(app, /valueIncident/);
  assert.match(app, /CERRAR CICLO · VALUED/);
});
