// Cerebro local del copiloto CMS. Same-origin: no pasa por workers.dev.
// Distingue pregunta de flota (se responde con latidos) de todo lo demás.

export const FRESH_MS = 10 * 60 * 1000;

export function looksLikePlayersQuestion(q) {
  const s = String(q || "").toLowerCase();
  if (!s.trim()) return false;
  // «equipos conectados» es flota. «players / plataforma» es signage.
  if (/equipo|maquina|máquina|flota|ordenador|macbook/.test(s)) return false;
  const about = /player|reproductor|emitiend|en antena|pantalla|screen|mupi|totem|señal|senal|plataforma/;
  const asking = /cu[aá]ntos|cuantas|cuántas|cuantos|n[uú]mero|hay|emitiend|online|antena|ahora|conectad/;
  return about.test(s) && asking.test(s);
}

export function looksLikeFleetQuestion(q) {
  const s = String(q || "").toLowerCase();
  if (!s.trim() || looksLikePlayersQuestion(s)) return false;
  const about = /equipo|maquina|máquina|flota|ordenador|macbook|conectad|encendid|latiend|latido/;
  const count = /cu[aá]ntos|cuantas|cuántas|cuantos|n[uú]mero|qui[eé]n est[aá]/;
  return about.test(s) && (count.test(s) || /conectad|online|encendid|latiend|flota/.test(s));
}

export function lastSeenMs(machine, now) {
  let u = Number(machine && (machine.lastSeen || machine.updated || machine.updatedAt || 0)) || 0;
  if (u && u < 4102444800) u *= 1000;
  return u;
}

export function fleetSummary(machines, now) {
  const t = now || Date.now();
  const list = Array.isArray(machines) ? machines : [];
  const live = [];
  for (const m of list) {
    const seen = lastSeenMs(m, t);
    if (!seen || t - seen > FRESH_MS) continue;
    live.push({
      id: m.id || "",
      name: m.name || m.id || "equipo",
      ageMin: Math.max(0, Math.round((t - seen) / 60000)),
    });
  }
  live.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { total: list.length, connected: live.length, live };
}

export function formatFleetAnswer(summary) {
  const n = summary.connected, tot = summary.total;
  if (!tot) return "Ahora mismo no veo el censo de la flota.";
  if (!n) return "Ningún equipo está latiendo ahora. En el censo hay " + tot + ".";
  const names = summary.live.slice(0, 8).map((m) => m.name).join(", ");
  const extra = summary.live.length > 8 ? " y más" : "";
  return n + " de " + tot + " equipos están conectados: " + names + extra + ".";
}

export function screensSummary(payload) {
  const screens = (payload && payload.screens) || [];
  const live = screens.filter((s) => s && s.online).map((s) => ({
    id: s.screen || s.id || "",
    name: s.screen || s.id || s.locName || s.loc || "player",
  }));
  return {
    total: Number(payload && payload.total_count) || screens.length,
    emitting: Number(payload && payload.online_count) || live.length,
    live,
  };
}

export function formatPlayersAnswer(summary) {
  const n = summary.emitting, tot = summary.total;
  if (!tot) return "Ahora mismo no veo ningún player en el censo de la plataforma.";
  if (!n) return "Ningún player está conectado a la plataforma ahora. En el censo hay " + tot + ".";
  const names = summary.live.slice(0, 8).map((m) => m.name).join(", ");
  const extra = summary.live.length > 8 ? " y más" : "";
  return "Hay " + n + " player" + (n === 1 ? "" : "s") + " conectado" + (n === 1 ? "" : "s") + " a la plataforma: " + names + extra + ".";
}

export function honestError(kind) {
  const map = {
    unauthorized: "Sesión caducada. Recarga el CMS e entra otra vez con Google.",
    network: "Sin red con el cerebro. No es que no sepa la respuesta: no le llega la pregunta.",
    brain: "El cerebro falló. Inténtalo de nuevo en un momento.",
    bad_json: "No he entendido la pregunta.",
    fleet: "No pude leer la flota ahora mismo.",
    screens: "No pude leer los players conectados a la plataforma ahora mismo.",
  };
  return map[kind] || map.brain;
}
