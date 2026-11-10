(function () {
  const worlds = ['Mediterrània','Polynesia','SésamoAventura','China','México','Far West'];
  const format = new Intl.NumberFormat('es-ES');
  let current = '';
  let nextPoll = 0;
  let snapshot = null;
  let inflight;

  function target(values) {
    for (const value of values) {
      const name = String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^admira(?=admiranext)/,'');
      if (name === 'metahuman') return 'admiranext01';
      if (/^admiranext0[1-5]$/.test(name)) return name;
    }
    return '';
  }

  function refresh(identities) {
    const screen = target(identities);
    if (!screen) return;
    if (current !== screen) {
      current = screen;
      snapshot = null;
      nextPoll = 0;
      inflight = undefined;
    }
    if (Date.now() >= nextPoll) {
      nextPoll = Date.now() + 2000;
      inflight = fetch('/api/park-occupancy?screen=' + screen, {cache:'no-store',signal:AbortSignal.timeout(1500)})
        .then(response => response.ok ? response.json() : null)
        .then(value => {
          if (current === screen) snapshot = value?.available ? value : null;
        }, () => {
          if (current === screen) snapshot = null;
        });
    }
    return inflight;
  }

  function render(identities, row) {
    if (!target(identities)) return;
    refresh(identities);
    if (!snapshot) {
      row('PortAventura NeXT','A la espera de afluencia de demo');
      return;
    }
    const total = group => snapshot.counts[group].reduce((sum,n) => sum+n,0);
    const counts = (visitors,staff) => format.format(visitors) + ' visitantes · ' + format.format(staff) + ' staff';
    row('Afluencia simulada',snapshot.closed ? 'Cerrado · ' + counts(0,0) : counts(total('visitors'),total('staff')));
    worlds.forEach((name,index) => row(name,counts(snapshot.counts.visitors[index],snapshot.counts.staff[index])));
  }

  window.AdmiraParkPlayerInfo = {render,refresh};
})();
