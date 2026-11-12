/* Parser puro de frases de transporte por voz del mando (es-ES).
   Se carga en mando.html y se prueba con node en mando-voice-commands.test.mjs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdmiraVoiceCommands = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizePhrase(phrase) {
    var s = stripAccents(phrase).toLowerCase();
    s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(admira)\s+/, '').replace(/\s+por favor$/, '').trim();
    if (s === 'admira') return '';
    return s;
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

  function parseVoiceCommand(phrase) {
    return lookup(normalizePhrase(phrase));
  }

  return { normalizePhrase: normalizePhrase, parseVoiceCommand: parseVoiceCommand, COMMANDS: COMMANDS };
});
