#!/usr/bin/env node
// orden.mjs — el alias numérico de las subapps de admira.tv, y cómo reordenarlo.
//
// POR QUÉ. Carlos, 10 de agosto de 2026: «hay que afinarlo más, creando un alias
// numérico —01.- Cartelería digital, 02.- Video Analytics, 03.- ADcelerate—
// para que luego podamos reordenar el numérico en función de la importancia del
// momento». Es la misma convención que ya usan los repos de la casa
// (32.-ConsejoAdmiraNextGame, 18.-diario): el número no describe la subapp, dice
// en qué orden importa HOY.
//
// Por eso el número NO se mete en el nombre de la carpeta. Renombrar
// `digitalsignage` a `01-digitalsignage` rompería las URLs públicas y obligaría
// a un despliegue cada vez que cambia una prioridad. El número vive en el censo
// —apps/public-catalog.json, el mismo que ya alimenta la página de catálogo— y
// reordenar es reescribir ese campo. Una prioridad es un dato, no una ruta.
//
//   node orden.mjs                       → la lista tal y como está hoy
//   node orden.mjs --subir player 4      → mueve una subapp a la posición 4
//   node orden.mjs --orden a,b,c,…       → reordena por lista de slugs
//   node orden.mjs --comprobar           → numeración sana (para el deploy)
//
// DÓNDE SE MIRA ESTO PUBLICADO. El censo se EDITA aquí y se PUBLICA en el
// edificio: www.admira.live/13rue/implementacion, una vivienda por subapp, con
// la ventana encendida sólo donde de verdad se emite. Esa página es la FUENTE
// ÚNICA para consultar el estado de los productos — no un documento aparte, no
// una copia en otro sitio. Al reordenar aquí hay que regenerar allí
// 13rue/implementacion.json, o el edificio seguirá enseñando el orden de ayer.
//
// Todo lo que no se nombra conserva su orden relativo y se recoloca detrás: así
// mover una subapp no obliga a reescribir las treinta y tres restantes.

import { readFile, writeFile } from "node:fs/promises";

const RUTA = new URL("./subapps.json", import.meta.url);

export function renumera(lista) {
  return lista.map((x, i) => ({ ...x, n: i + 1, alias: `${String(i + 1).padStart(2, "0")}.- ${x.name_es}` }));
}

// Comprobaciones que valen para el deploy: una numeración con huecos o repetida
// es peor que ninguna, porque «la 07» dejaría de identificar a nadie.
export function revisa(lista) {
  const fallos = [];
  const ns = lista.map((x) => x.n);
  const slugs = new Set();
  ns.forEach((n, i) => { if (n !== i + 1) fallos.push(`la posición ${i + 1} lleva el número ${n}`); });
  for (const x of lista) {
    if (slugs.has(x.slug)) fallos.push(`slug repetido: ${x.slug}`);
    slugs.add(x.slug);
    if (!x.name_es) fallos.push(`${x.slug} sin nombre en español`);
    if (!x.alias || !x.alias.startsWith(String(x.n).padStart(2, "0"))) fallos.push(`${x.slug}: el alias no cuadra con su número`);
    if (!["emite", "parcial", "escaparate"].includes(x.estado)) fallos.push(`${x.slug}: estado desconocido «${x.estado}»`);
  }
  return fallos;
}

// Reordena por una lista de slugs. Los no mencionados mantienen su orden y van
// detrás — mover la 12 arriba no puede obligar a reescribir las otras treinta y tres.
export function reordena(lista, slugs) {
  const porSlug = new Map(lista.map((x) => [x.slug, x]));
  const cabeza = [];
  for (const s of slugs) {
    const x = porSlug.get(s);
    if (!x) throw new Error(`no existe la subapp «${s}»`);
    if (!cabeza.includes(x)) cabeza.push(x);
  }
  const resto = lista.filter((x) => !cabeza.includes(x));
  return renumera([...cabeza, ...resto]);
}

export function mueve(lista, slug, destino) {
  const i = lista.findIndex((x) => x.slug === slug);
  if (i < 0) throw new Error(`no existe la subapp «${slug}»`);
  const pos = Math.min(Math.max(1, Number(destino)), lista.length);
  const copia = lista.slice();
  const [x] = copia.splice(i, 1);
  copia.splice(pos - 1, 0, x);
  return renumera(copia);
}

const MARCA = { emite: "●", parcial: "◐", escaparate: "○" };
export function pinta(lista) {
  const anchoFam = Math.max(...lista.map((x) => x.familia.length));
  return lista.map((x) =>
    `${MARCA[x.estado] || "?"} ${x.alias.padEnd(26)} ${x.familia.padEnd(anchoFam)}  ${x.slug}`
  ).join("\n");
}

// --- ejecutable ------------------------------------------------------------
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const lista = JSON.parse(await readFile(RUTA, "utf8"));
  const args = process.argv.slice(2);
  const guardar = async (nueva) => {
    const fallos = revisa(nueva);
    if (fallos.length) { console.error("✗ numeración inválida:\n  " + fallos.join("\n  ")); process.exit(1); }
    await writeFile(RUTA, JSON.stringify(nueva, null, 2) + "\n");
    console.log(pinta(nueva));
    console.log(`\n✓ censo reescrito · ${nueva.length} subapps · ● emite  ◐ a medias  ○ escaparate`);
  };

  if (args[0] === "--comprobar") {
    const fallos = revisa(lista);
    if (fallos.length) { console.error("✗ " + fallos.join("\n✗ ")); process.exit(1); }
    console.log(`  ✓ censo sano: ${lista.length} subapps numeradas sin huecos`);
  } else if (args[0] === "--subir" || args[0] === "--mover") {
    await guardar(mueve(lista, args[1], args[2]));
  } else if (args[0] === "--orden") {
    await guardar(reordena(lista, String(args[1] || "").split(",").map((s) => s.trim()).filter(Boolean)));
  } else {
    console.log(pinta(lista));
    const c = lista.reduce((a, x) => ({ ...a, [x.estado]: (a[x.estado] || 0) + 1 }), {});
    console.log(`\n  ${lista.length} subapps · ● ${c.emite || 0} emite · ◐ ${c.parcial || 0} a medias · ○ ${c.escaparate || 0} escaparate`);
    console.log("  reordenar:  node orden.mjs --subir <slug> <posición>");
  }
}
