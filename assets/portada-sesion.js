(function () {
  var login = document.getElementById('ykLoginLink');
  var advanced = document.getElementById('ykAdvancedToggle');
  if (!login || !advanced) return;

  login.addEventListener('click', function () {
    login.href = '/entrar/?volver=' + encodeURIComponent('/' + location.search + location.hash);
  });

  var revision = 0;
  function updateSession() {
    var attempt = ++revision;
    fetch('/auth/session?project=admira-tv', {credentials: 'same-origin', cache: 'no-store'})
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; })
      .then(function (session) {
        if (attempt !== revision) return;
        var allowed = !!session && session.ok === true && session.allowed === true;
        if (!allowed && window.AdmiraFrame) window.AdmiraFrame.abrir('right', false);
        login.hidden = allowed;
        advanced.hidden = advanced.disabled = !allowed;
      });
  }

  updateSession();
  window.addEventListener('pageshow', function (event) { if (event.persisted) updateSession(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') updateSession();
  });
})();
