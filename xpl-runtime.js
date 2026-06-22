/* ============================================================================
 * XPL — Xpace Programming Language (runtime)
 * ----------------------------------------------------------------------------
 * Lenguaje de reglas para el gemelo digital de XpaceOS.
 * Una regla es:   CUANDO <hecho>  [PARA <selector>]  ENTONCES <acción(es)>
 * (WHEN <fact>    [FOR <selector>] THEN <action(s)>)
 *
 * Este fichero NO toca el DOM: define los catálogos, el compilador y el motor.
 * Para usarlo necesita un "world adapter" (ver más abajo) que conecta los
 * hechos y las acciones con un mundo real (el gemelo) o simulado (el playground).
 *
 * Uso:
 *   const engine = XPL.createEngine(worldAdapter);
 *   engine.setRules(blocks);     // array de bloques-regla (JSON)
 *   engine.tick();               // evaluar y aplicar (llamar en el bucle del mundo)
 *
 * Vanilla JS, sin build. Expuesto como window.XPL (y module.exports si procede).
 * ========================================================================== */
(function (root) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1) CATÁLOGO DE HECHOS  (lo que el mundo "sabe" — las condiciones del CUANDO)
   * ------------------------------------------------------------------------ */
  // type: 'bool' | 'num' | 'enum'
  // El adapter resuelve world.fact(id) -> valor actual.
  // 10+ condiciones del mundo del gemelo (clima, gente, tiempo, negocio…).
  const FACTS = [
    // — clima —
    { id: 'rain',         type: 'bool', es: 'llueve',                 en: 'it rains',            icon: '🌧️' },
    { id: 'temperature',  type: 'num',  es: 'la temperatura',         en: 'temperature',         icon: '🌡️', min: -5, max: 42, unit: '°' },
    { id: 'wind',         type: 'bool', es: 'hace viento',            en: 'it is windy',         icon: '💨' },
    { id: 'season',       type: 'enum', es: 'la estación',            en: 'the season',          icon: '🍂',
      values: [ { id: 'spring', es: 'primavera', en: 'spring', icon: '🌸' }, { id: 'summer', es: 'verano', en: 'summer', icon: '☀️' },
                { id: 'autumn', es: 'otoño', en: 'autumn', icon: '🍂' }, { id: 'winter', es: 'invierno', en: 'winter', icon: '❄️' } ] },
    // — tiempo —
    { id: 'hour',         type: 'num',  es: 'la hora',                en: 'the hour',            icon: '🕐', min: 0, max: 23, unit: 'h' },
    { id: 'dayPart',      type: 'enum', es: 'la franja del día',      en: 'the time of day',     icon: '🕑',
      values: [ { id: 'morning', es: 'mañana', en: 'morning', icon: '🌅' }, { id: 'noon', es: 'mediodía', en: 'midday', icon: '🌞' },
                { id: 'afternoon', es: 'tarde', en: 'afternoon', icon: '🌇' }, { id: 'night', es: 'noche', en: 'night', icon: '🌃' } ] },
    { id: 'night',        type: 'bool', es: 'es de noche',            en: 'it is night',         icon: '🌙' },
    { id: 'weekend',      type: 'bool', es: 'es fin de semana',       en: 'it is the weekend',   icon: '📅' },
    { id: 'holiday',      type: 'bool', es: 'es festivo',             en: 'it is a holiday',     icon: '🎉' },
    // — gente / negocio —
    { id: 'people',       type: 'num',  es: 'la gente en la calle',   en: 'people outside',      icon: '👥', min: 0, max: 40 },
    { id: 'rush',         type: 'bool', es: 'hay cola',               en: 'there is a queue',    icon: '🧑‍🤝‍🧑' },
    { id: 'doorOpen',     type: 'bool', es: 'la tienda está abierta', en: 'the shop is open',    icon: '🚪' },
    { id: 'thief',        type: 'bool', es: 'hay un ladrón',          en: 'there is a thief',    icon: '🦹' },
    { id: 'satisfaction', type: 'num',  es: 'la satisfacción',        en: 'satisfaction',        icon: '😊', min: 0, max: 100, unit: '%' },
    { id: 'money',        type: 'num',  es: 'la caja del día',        en: "today's takings",     icon: '💶', min: 0, max: 99999, unit: '€' },
    // — audiencia por cámara (anónima, de admira.tv) —
    { id: 'viewers',      type: 'num',  es: 'la gente mirando la pantalla', en: 'people watching the screen', icon: '👁️', min: 0, max: 12 },
    { id: 'audGender',    type: 'enum', es: 'el género de la audiencia', en: 'the audience gender', icon: '🧑',
      values: [ { id: 'none', es: 'nadie', en: 'nobody', icon: '🚷' }, { id: 'female', es: 'mujer', en: 'women', icon: '♀️' },
                { id: 'male', es: 'hombre', en: 'men', icon: '♂️' }, { id: 'mixed', es: 'mixto', en: 'mixed', icon: '⚥' } ] },
    { id: 'audAge',       type: 'enum', es: 'la edad de la audiencia', en: 'the audience age', icon: '🎂',
      values: [ { id: 'none', es: 'nadie', en: 'nobody', icon: '🚷' }, { id: 'nino', es: 'niño', en: 'child', icon: '🧒' },
                { id: 'joven', es: 'joven', en: 'young', icon: '🧑' }, { id: 'adulto', es: 'adulto', en: 'adult', icon: '🧔' },
                { id: 'senior', es: 'senior', en: 'senior', icon: '👴' }, { id: 'vejez', es: 'vejez', en: 'elder', icon: '👵' } ] }
  ];

  // Operadores para hechos numéricos
  const OPS = [
    { id: '>',  es: 'es mayor que',     en: 'is greater than' },
    { id: '>=', es: 'es al menos',      en: 'is at least' },
    { id: '<',  es: 'es menor que',     en: 'is less than' },
    { id: '<=', es: 'es como mucho',    en: 'is at most' },
    { id: '==', es: 'es igual a',       en: 'equals' }
  ];

  /* --------------------------------------------------------------------------
   * 2) SELECTORES  (a quién — el PARA)
   * ------------------------------------------------------------------------ */
  const GROUPS = [
    { id: 'all',     es: 'todos los NPCs',  en: 'all NPCs' },
    { id: 'cust',    es: 'los clientes',    en: 'the customers' },
    { id: 'staff',   es: 'el personal',     en: 'the staff' },
    { id: 'special', es: 'los especiales',  en: 'the special ones' }
  ];

  // Atributos filtrables de un NPC (el "con paraguas", "los de fuera"…)
  const ATTRS = [
    { id: 'zone',    type: 'enum', es: 'la zona',     en: 'zone',
      values: [ { id: 'out', es: 'fuera', en: 'outside' }, { id: 'in', es: 'dentro', en: 'inside' } ] },
    { id: 'mood',    type: 'enum', es: 'el humor',    en: 'mood',
      values: [ { id: 'happy', es: 'feliz', en: 'happy' }, { id: 'neutral', es: 'neutro', en: 'neutral' }, { id: 'sad', es: 'triste', en: 'sad' } ] },
    { id: 'umbrella',type: 'bool', es: 'lleva paraguas', en: 'has an umbrella' }
  ];

  /* --------------------------------------------------------------------------
   * 2.b) CREATIVIDADES DE PANTALLA  (lo que se anuncia en el escaparate)
   *      cada anuncio: id, idioma, emoji y color de fondo para pintarlo.
   * ------------------------------------------------------------------------ */
  const ADS = [
    { id: 'rainboots',  es: 'botas de agua',    en: 'rain boots',     icon: '🥾', bg: '#2f5e8a' },
    { id: 'umbrella',   es: 'paraguas',         en: 'umbrellas',      icon: '☂️', bg: '#3a4f8a' },
    { id: 'raincoat',   es: 'chubasqueros',     en: 'raincoats',      icon: '🧥', bg: '#2d6a5a' },
    { id: 'icecream',   es: 'helados',          en: 'ice cream',      icon: '🍦', bg: '#d98cc0' },
    { id: 'sunglasses', es: 'gafas de sol',     en: 'sunglasses',     icon: '🕶️', bg: '#caa23a' },
    { id: 'coldDrink',  es: 'bebida fresca',    en: 'cold drinks',    icon: '🥤', bg: '#2aa3c4' },
    { id: 'coat',       es: 'abrigos',          en: 'coats',          icon: '🧣', bg: '#7a5a3a' },
    { id: 'hotCoffee',  es: 'café caliente',    en: 'hot coffee',     icon: '☕', bg: '#6b4a35' },
    { id: 'gloves',     es: 'guantes',          en: 'gloves',         icon: '🧤', bg: '#4a5a7a' },
    { id: 'promo',      es: 'oferta flash',     en: 'flash sale',     icon: '🏷️', bg: '#c4452a' },
    { id: 'happyhour',  es: 'happy hour',       en: 'happy hour',     icon: '🍹', bg: '#9a3a7a' },
    { id: 'newColl',    es: 'nueva colección',  en: 'new collection', icon: '✨', bg: '#3a3a5a' },
    { id: 'weekendDeal',es: 'plan finde',       en: 'weekend deal',   icon: '🎈', bg: '#c46a2a' },
    { id: 'breakfast',  es: 'desayunos',        en: 'breakfast',      icon: '🥐', bg: '#a07a3a' },
    { id: 'dinner',     es: 'cena',             en: 'dinner',         icon: '🍽️', bg: '#5a3a4a' },
    { id: 'nightlife',  es: 'noche / copas',    en: 'nightlife',      icon: '🌃', bg: '#2a2a4a' }
  ];

  /* --------------------------------------------------------------------------
   * 3) ACCIONES  (qué hacer — el ENTONCES)
   * ------------------------------------------------------------------------ */
  // scope: 'npc'  -> se aplica a cada NPC del selector
  //        'world'-> se aplica una vez al mundo (ignora el selector)
  // mode:  'while'-> mientras la condición sea verdad (idempotente)
  //        'on'   -> solo en el flanco (cuando pasa de falso a verdadero)
  const ACTIONS = [
    { id: 'equip',      scope: 'npc',   mode: 'while', es: 'darle',          en: 'give them',
      param: { kind: 'enum', es: 'qué', en: 'what', values: [
        { id: 'umbrella', es: 'un paraguas', en: 'an umbrella', icon: '☂️' },
        { id: 'hat',      es: 'un gorro',    en: 'a hat',       icon: '🎩' },
        { id: 'glow',     es: 'una luz',     en: 'a glow',      icon: '✨' } ] } },
    { id: 'unequip',    scope: 'npc',   mode: 'while', es: 'quitarle',       en: 'remove from them',
      param: { kind: 'enum', es: 'qué', en: 'what', values: [
        { id: 'umbrella', es: 'el paraguas', en: 'the umbrella', icon: '☂️' },
        { id: 'hat',      es: 'el gorro',    en: 'the hat',      icon: '🎩' },
        { id: 'glow',     es: 'la luz',      en: 'the glow',     icon: '✨' } ] } },
    { id: 'setMood',    scope: 'npc',   mode: 'while', es: 'ponerle de humor', en: 'set their mood to',
      param: { kind: 'enum', es: 'humor', en: 'mood', values: [
        { id: 'happy',   es: 'feliz',  en: 'happy' },
        { id: 'neutral', es: 'neutro', en: 'neutral' },
        { id: 'sad',     es: 'triste', en: 'sad' } ] } },
    { id: 'say',        scope: 'npc',   mode: 'on',    es: 'hacer que digan', en: 'make them say',
      param: { kind: 'text', es: 'texto', en: 'text', placeholder: '¡Hola!' } },
    { id: 'dance',      scope: 'npc',   mode: 'while', es: 'ponerlos a bailar', en: 'make them dance' },
    { id: 'goInside',   scope: 'npc',   mode: 'on',    es: 'meterlos dentro', en: 'send them inside' },
    { id: 'showAd',     scope: 'screen', mode: 'while', es: 'en las pantallas anunciar', en: 'on the screens advertise',
      param: { kind: 'enum', es: 'creatividad', en: 'creative', values: ADS } },
    // showContent = el PUENTE a contenido real: no una creatividad de juguete,
    // sino un asset del Stock de Pixeria que casa con el segmento. La audiencia
    // (género/edad) y la franja se toman de los HECHOS vivos al resolver, así que
    // el operador solo decide la INTENCIÓN (auto = lo que pida el público que mira).
    { id: 'showContent',scope: 'screen', mode: 'while', es: 'en las pantallas, contenido real', en: 'on the screens, real content',
      param: { kind: 'enum', es: 'intención', en: 'intent', values: [
        { id: 'auto',     es: 'auto (según el público)', en: 'auto (by audience)', icon: '🎯' },
        { id: 'atraer',   es: 'para atraer',  en: 'to attract',  icon: '🧲' },
        { id: 'producto', es: 'de producto',  en: 'product',     icon: '📦' },
        { id: 'marca',    es: 'de marca',     en: 'brand',       icon: '⭐' },
        { id: 'promo',    es: 'de promoción', en: 'promo',       icon: '🏷️' } ] } },
    { id: 'clearScreen',scope: 'screen', mode: 'while', es: 'apagar las pantallas', en: 'clear the screens' },
    { id: 'screenTone', scope: 'screen', mode: 'while', es: 'el tono de las pantallas', en: 'screen tone',
      param: { kind: 'enum', es: 'tono', en: 'tone', values: [
        { id: 'calm',  es: 'tranquilo', en: 'calm' },
        { id: 'hype',  es: 'animado',   en: 'hype' },
        { id: 'lux',   es: 'premium',   en: 'premium' } ] } },
    { id: 'setWeather', scope: 'world', mode: 'on',    es: 'cambiar el clima a', en: 'set the weather to',
      param: { kind: 'enum', es: 'clima', en: 'weather', values: [
        { id: 'sun',  es: 'sol',     en: 'sun',  icon: '☀️' },
        { id: 'rain', es: 'lluvia',  en: 'rain', icon: '🌧️' },
        { id: 'snow', es: 'nieve',   en: 'snow', icon: '❄️' } ] } },
    { id: 'setLight',   scope: 'world', mode: 'while', es: 'la luz del local', en: 'shop lights',
      param: { kind: 'enum', es: 'estado', en: 'state', values: [
        { id: 'on',  es: 'encendida', en: 'on' },
        { id: 'off', es: 'apagada',   en: 'off' } ] } },
    { id: 'jingle',     scope: 'world', mode: 'on',    es: 'sonar un aviso',    en: 'play a chime',
      param: { kind: 'enum', es: 'sonido', en: 'sound', values: [
        { id: 'ding',  es: 'campanita', en: 'ding',  icon: '🔔' },
        { id: 'promo', es: 'jingle promo', en: 'promo jingle', icon: '🎵' },
        { id: 'alert', es: 'alerta',    en: 'alert', icon: '📣' } ] } },
    { id: 'command',    scope: 'world', mode: 'on',    es: 'lanzar el comando', en: 'run the command',
      param: { kind: 'text', es: 'comando', en: 'command', placeholder: '/pixeria' } }
  ];

  /* --------------------------------------------------------------------------
   * Helpers de catálogo
   * ------------------------------------------------------------------------ */
  const byId = (arr, id) => arr.find(x => x.id === id) || null;
  const L = (obj, lang) => (obj && (obj[lang] || obj.es || obj.en)) || '';

  /* --------------------------------------------------------------------------
   * 4) COMPILADOR / RENDER A FRASE
   *    Un bloque-regla (JSON) -> frase legible bilingüe.
   * ------------------------------------------------------------------------ */
  // Normaliza el campo `when` a { join:'and'|'or', conds:[cond,...] }.
  // Acepta el formato antiguo (when con .fact directamente) por compatibilidad.
  function condsOf(when) {
    if (!when) return { join: 'and', conds: [] };
    if (when.conds) return { join: when.join === 'or' ? 'or' : 'and', conds: when.conds };
    if (when.fact) return { join: 'and', conds: [when] }; // formato antiguo = 1 condición
    return { join: 'and', conds: [] };
  }

  // Frase de UNA condición
  function condPhrase(cond, lang) {
    if (!cond || !cond.fact) return lang === 'en' ? '(no condition)' : '(sin condición)';
    const f = byId(FACTS, cond.fact);
    if (!f) return cond.fact;
    if (f.type === 'bool') {
      const neg = cond.value === false || cond.negate === true;
      const base = `${f.icon || ''} ${L(f, lang)}`.trim();
      if (!neg) return base;
      return lang === 'en' ? `it is NOT the case that ${L(f, lang)}` : `NO ${L(f, lang)}`;
    }
    if (f.type === 'enum') {
      const v = byId(f.values || [], cond.value);
      const vl = v ? `${v.icon ? v.icon + ' ' : ''}${L(v, lang)}` : (cond.value || '…');
      return lang === 'en' ? `${f.icon || ''} ${L(f, lang)} is ${vl}`.trim()
                           : `${f.icon || ''} ${L(f, lang)} es ${vl}`.trim();
    }
    const op = byId(OPS, cond.op || '>=');
    return `${f.icon || ''} ${L(f, lang)} ${L(op, lang)} ${cond.value}${f.unit || ''}`.trim();
  }

  // Frase del WHEN completo (varias condiciones unidas por Y/O)
  function whenPhrase(when, lang) {
    const { join, conds } = condsOf(when);
    if (!conds.length) return lang === 'en' ? '(no condition)' : '(sin condición)';
    const sep = join === 'or' ? (lang === 'en' ? ' OR ' : ' O ') : (lang === 'en' ? ' AND ' : ' Y ');
    return conds.map(c => condPhrase(c, lang)).join(sep);
  }
  const factPhrase = whenPhrase; // alias compat

  function whoPhrase(who, lang) {
    if (!who || !who.group) return '';
    const g = byId(GROUPS, who.group);
    let s = L(g, lang);
    if (who.filter && who.filter.attr) {
      const a = byId(ATTRS, who.filter.attr);
      if (a) {
        if (a.type === 'bool') {
          const yes = who.filter.value !== false;
          s += lang === 'en'
            ? ` who ${yes ? '' : "don't "}${L(a, lang).replace(/^has an?/, yes ? 'have an' : 'have an')}`
            : ` que ${yes ? '' : 'no '}${L(a, lang).replace(/^lleva/, 'llevan')}`;
        } else {
          const v = byId(a.values || [], who.filter.value);
          s += lang === 'en' ? ` whose ${L(a, lang)} is ${L(v, lang)}` : ` cuya ${L(a, lang)} es ${L(v, lang)}`;
        }
      }
    }
    return s;
  }

  function actionPhrase(act, lang) {
    if (!act || !act.id) return '';
    const a = byId(ACTIONS, act.id);
    if (!a) return act.id;
    let s = L(a, lang);
    if (a.param) {
      if (a.param.kind === 'enum') {
        const v = byId(a.param.values || [], act.value);
        s += ' ' + (v ? `${v.icon ? v.icon + ' ' : ''}${L(v, lang)}` : (act.value || '…'));
      } else {
        s += ` “${act.value || '…'}”`;
      }
    }
    return s;
  }

  // Frase completa de una regla
  function ruleSentence(block, lang) {
    lang = lang || 'es';
    const when = factPhrase(block.when, lang);
    const acts = (block.do || []).map(a => actionPhrase(a, lang)).filter(Boolean);
    const needsWho = (block.do || []).some(a => (byId(ACTIONS, a.id) || {}).scope === 'npc');
    const who = needsWho ? whoPhrase(block.who, lang) : '';
    if (lang === 'en') {
      let s = `WHEN ${when}`;
      if (who) s += `, take ${who} and`;
      s += ` THEN ${acts.join(' and ') || '(nothing)'}`;
      return s;
    }
    let s = `CUANDO ${when}`;
    if (who) s += `, coge ${who} y`;
    s += ` ENTONCES ${acts.join(' y ') || '(nada)'}`;
    return s;
  }

  /* --------------------------------------------------------------------------
   * 5) EVALUACIÓN
   * ------------------------------------------------------------------------ */
  // Evalúa UNA condición contra el mundo
  function evalCond(cond, world) {
    if (!cond || !cond.fact) return true;
    const f = byId(FACTS, cond.fact);
    if (!f) return false;
    const cur = world.fact(cond.fact);
    if (f.type === 'bool') {
      const want = !(cond.value === false || cond.negate === true);
      return !!cur === want;
    }
    if (f.type === 'enum') return cur === cond.value;
    const v = Number(cond.value);
    switch (cond.op) {
      case '>':  return cur >  v;
      case '>=': return cur >= v;
      case '<':  return cur <  v;
      case '<=': return cur <= v;
      case '==': return cur == v;
      default:   return cur >= v;
    }
  }

  // Evalúa el WHEN completo (Y = todas; O = alguna)
  function evalCondition(when, world) {
    const { join, conds } = condsOf(when);
    if (!conds.length) return true; // sin condición => siempre
    return join === 'or'
      ? conds.some(c => evalCond(c, world))
      : conds.every(c => evalCond(c, world));
  }

  function npcMatches(npc, who) {
    if (!who || !who.group) return false;
    if (who.group !== 'all' && npc.kind !== who.group) return false;
    const flt = who.filter;
    if (flt && flt.attr) {
      const a = byId(ATTRS, flt.attr);
      if (a) {
        if (a.type === 'bool') {
          const want = flt.value !== false;
          if (!!npc[flt.attr] !== want) return false;
        } else {
          if (npc[flt.attr] !== flt.value) return false;
        }
      }
    }
    return true;
  }

  /* --------------------------------------------------------------------------
   * 6) MOTOR
   * ------------------------------------------------------------------------ */
  function createEngine(world) {
    let rules = [];
    const state = new Map(); // id -> { active:bool } para los flancos (mode 'on')

    function setRules(blocks) {
      rules = (blocks || []).slice();
      // limpia estado de reglas que ya no existen
      const ids = new Set(rules.map(r => r.id));
      for (const k of [...state.keys()]) if (!ids.has(k)) state.delete(k);
    }

    function applyAction(act, world, targets) {
      const a = byId(ACTIONS, act.id);
      if (!a) return;
      if (a.scope === 'npc') {
        for (const npc of targets) world.act(act.id, act.value, npc);
      } else { // 'world' o 'screen' -> se aplica una vez
        world.act(act.id, act.value, null);
      }
    }

    // Canal de pantalla para resolver conflictos: la "content" (showAd/clearScreen)
    // y el "tone" se resuelven por prioridad — solo gana una regla por canal.
    const SCREEN_CHANNEL = { showAd: 'content', showContent: 'content', clearScreen: 'content', screenTone: 'tone' };

    function tick() {
      const npcs = world.npcs ? world.npcs() : [];
      const log = [];
      const screenBids = {};   // canal -> { prio, idx, act }

      rules.forEach((rule, idx) => {
        if (rule.enabled === false) return;
        const cond = evalCondition(rule.when, world);
        const st = state.get(rule.id) || { active: false };
        const rising = cond && !st.active;
        const prio = Number(rule.priority || 0);
        for (const act of (rule.do || [])) {
          const a = byId(ACTIONS, act.id);
          if (!a) continue;
          const fire = a.mode === 'on' ? rising : cond;
          if (!fire) continue;
          if (a.scope === 'screen') {
            // no se aplica aún: compite por su canal (mayor prioridad gana;
            // empate -> la regla declarada más abajo, como en una cascada)
            const ch = SCREEN_CHANNEL[act.id] || 'content';
            const cur = screenBids[ch];
            if (!cur || prio > cur.prio || (prio === cur.prio && idx >= cur.idx)) {
              screenBids[ch] = { prio, idx, act };
            }
          } else {
            const targets = a.scope === 'npc' ? npcs.filter(n => npcMatches(n, rule.who)) : [];
            applyAction(act, world, targets);
          }
          if (a.mode === 'on') log.push({ rule: rule.id, action: act.id });
        }
        state.set(rule.id, { active: cond });
      });

      // aplica el ganador de cada canal de pantalla
      for (const ch of Object.keys(screenBids)) applyAction(screenBids[ch].act, world, []);
      return log;
    }

    return { setRules, tick, get rules() { return rules; } };
  }

  /* --------------------------------------------------------------------------
   * 7) EXPORT
   * ------------------------------------------------------------------------ */
  const XPL = {
    FACTS, OPS, GROUPS, ATTRS, ACTIONS, ADS,
    byId, label: L,
    ruleSentence, factPhrase, whenPhrase, condPhrase, condsOf, whoPhrase, actionPhrase,
    evalCondition, evalCond, npcMatches,
    createEngine,
    version: '0.1.0'
  };

  root.XPL = XPL;
  if (typeof module !== 'undefined' && module.exports) module.exports = XPL;
})(typeof window !== 'undefined' ? window : globalThis);
