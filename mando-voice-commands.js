/* Parser puro de frases de transporte por voz del mando (es-ES).
   La palabra de activación es obligatoria: «hola Admira» (y variantes).
   Se carga en mando.html y se prueba con node en mando-voice-commands.test.mjs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdmiraVoiceCommands = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ARM_MS = 5000;
  var COMMANDS = {
    siguiente: 'next',
    proximo: 'next',
    next: 'next',
    anterior: 'prev',
    atras: 'prev',
    previo: 'prev',
    primero: 'first',
    primera: 'first',
    inicio: 'first',
    'desde el principio': 'first',
    ultimo: 'last',
    ultima: 'last',
    final: 'last',
    pausa: 'toggle-pause',
    para: 'toggle-pause',
    pausar: 'toggle-pause',
    stop: 'toggle-pause',
    sigue: 'play',
    continua: 'play',
    reanuda: 'play',
    play: 'play',
    reproduce: 'play'
  };
  var FILLER = /^(el|la|lo|los|las|un|una|al|del|de|por|favor|cancion|canciones|contenido|video|tema|pista|ahora|oye|pon|ponme|vamos|anda)$/;
  var KEYS = Object.keys(COMMANDS).sort(function (a, b) { return b.length - a.length; });
  var WAKE_RE = /^(hola|ola)\s+(admira|almira)(?:\s+(.*))?$/;

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizePhrase(phrase) {
    var s = stripAccents(phrase).toLowerCase();
    s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  function matchWake(text) {
    var m = String(text || '').match(WAKE_RE);
    if (!m) return null;
    return { wake: m[1] + ' ' + m[2], rest: (m[3] || '').trim() };
  }

  function lookup(text) {
    if (!text) return null;
    if (Object.prototype.hasOwnProperty.call(COMMANDS, text)) return COMMANDS[text];
    for (var i = 0; i < KEYS.length; i++) {
      var key = KEYS[i];
      if (text === key || text.indexOf(key + ' ') === 0) return COMMANDS[key];
    }
    var core = text.split(' ').filter(function (t) { return t && !FILLER.test(t); }).join(' ');
    if (core && core !== text) return lookup(core);
    return null;
  }

  function parseVoiceUtterance(phrase, options) {
    options = options || {};
    var now = options.now != null ? Number(options.now) : 0;
    var armedUntil = options.armedUntil != null ? Number(options.armedUntil) : 0;
    var text = normalizePhrase(phrase);
    if (!text) return { type: 'ignored', cmd: null, text: '', arm: false };

    var wake = matchWake(text);
    if (wake) {
      if (!wake.rest) return { type: 'arm', cmd: null, text: text, arm: true };
      var cmd = lookup(wake.rest);
      if (cmd) return { type: 'command', cmd: cmd, text: text, arm: false };
      return { type: 'unrecognized', cmd: null, text: text, arm: false };
    }

    var armed = armedUntil > now;
    if (armed) {
      var armedCmd = lookup(text);
      if (armedCmd) return { type: 'command', cmd: armedCmd, text: text, arm: false };
      return { type: 'unrecognized', cmd: null, text: text, arm: true };
    }

    return { type: 'ignored', cmd: null, text: text, arm: false };
  }

  function parseVoiceCommand(phrase, options) {
    var result = parseVoiceUtterance(phrase, options);
    return result.type === 'command' ? result.cmd : null;
  }

  return {
    ARM_MS: ARM_MS,
    COMMANDS: COMMANDS,
    normalizePhrase: normalizePhrase,
    matchWake: matchWake,
    parseVoiceUtterance: parseVoiceUtterance,
    parseVoiceCommand: parseVoiceCommand
  };
});
