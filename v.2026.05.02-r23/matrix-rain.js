(function () {
  // Solo se renderiza el feed Pixer cuando hay simulador (página admira-xp).
  // En las páginas de instrucciones (audio/musica/imagenes/video/plataforma)
  // no debe aparecer.
  const page = document.body && document.body.dataset && document.body.dataset.page;
  if (page !== 'admira-xp') return;
  const canvas = document.getElementById('matrix-rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFｦﾞﾟ｡･ｰ';
  const FONT_SIZE = 16;
  let width = 0, height = 0, columns = 0, drops = [], speeds = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.ceil(width / FONT_SIZE);
    drops = new Array(columns).fill(0).map(() => Math.random() * -height / FONT_SIZE);
    speeds = new Array(columns).fill(0).map(() => 0.4 + Math.random() * 0.9);
  }

  function draw() {
    ctx.fillStyle = 'rgba(2, 6, 2, 0.10)';
    ctx.fillRect(0, 0, width, height);

    ctx.font = FONT_SIZE + 'px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'top';

    for (let i = 0; i < columns; i++) {
      const x = i * FONT_SIZE;
      const y = drops[i] * FONT_SIZE;
      const ch = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
      const head = drops[i] > 1 && Math.random() > 0.965;

      if (head) {
        ctx.fillStyle = '#d4ffd9';
        ctx.shadowColor = '#00ff41';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = '#00b82e';
        ctx.shadowBlur = 0;
      }
      ctx.fillText(ch, x, y);
      ctx.shadowBlur = 0;

      if (y > height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += speeds[i];
    }
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
})();
