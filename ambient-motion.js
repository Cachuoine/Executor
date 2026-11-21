/* NIGHTREAPER — balanced galaxy / liquid ambience.
 * Decorative canvas only: it never captures input, loads external assets, or changes layout.
 */
(() => {
  'use strict';
  if (!document.body || document.querySelector('.ambient-particle-field')) return;

  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (motionQuery?.matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'ambient-particle-field';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  canvas.tabIndex = -1;
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) { canvas.remove(); return; }

  const palette = [
    { r: 127, g: 230, b: 224 },
    { r: 167, g: 139, b: 250 },
    { r: 136, g: 182, b: 255 },
    { r: 200, g: 241, b: 105 }
  ];
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let width = 1;
  let height = 1;
  let ratio = 1;
  let coarseDevice = false;
  let particles = [];
  let frame = 0;
  let lastFrame = 0;
  let clock = 0;
  let running = true;

  const frameInterval = () => coarseDevice ? 1000 / 20 : 1000 / 30;

  function seedParticles(count) {
    // Stratified grid + small jitter keeps density visually even across the whole canvas.
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * width / Math.max(1, height))));
    const rows = Math.max(1, Math.ceil(count / columns));
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    particles = Array.from({ length: count }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const baseX = (column + 0.5) * cellWidth + rand(-cellWidth * 0.13, cellWidth * 0.13);
      const baseY = (row + 0.5) * cellHeight + rand(-cellHeight * 0.13, cellHeight * 0.13);
      return {
        baseX: clamp(baseX, 3, Math.max(3, width - 3)),
        baseY: clamp(baseY, 3, Math.max(3, height - 3)),
        x: baseX,
        y: baseY,
        phase: rand(0, Math.PI * 2),
        tone: palette[(column + row * 2 + Math.floor(rand(0, 2))) % palette.length],
        radius: rand(0.75, 1.75),
        twinkle: rand(0.45, 1),
        drift: rand(7, 17),
        index
      };
    });
  }

  function resize() {
    const nextWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const nextHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    width = nextWidth;
    height = nextHeight;
    coarseDevice = Boolean(window.matchMedia?.('(pointer: coarse)').matches || width <= 760);
    ratio = Math.min(window.devicePixelRatio || 1, coarseDevice ? 1 : 1.15);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const area = width * height;
    const count = coarseDevice
      ? Math.max(42, Math.min(76, Math.round(area / 15000)))
      : Math.max(100, Math.min(176, Math.round(area / 10500)));
    if (particles.length !== count) seedParticles(count);
    else seedParticles(count);
  }

  function updateParticles() {
    for (const particle of particles) {
      const phase = particle.phase;
      const drift = particle.drift;
      // Each point orbits a stable, evenly spaced anchor instead of wandering into clumps.
      particle.x = particle.baseX
        + Math.sin(clock * 0.31 + phase) * drift
        + Math.cos(clock * 0.13 + phase * 1.7) * drift * 0.23;
      particle.y = particle.baseY
        + Math.cos(clock * 0.27 + phase * 1.2) * drift * 0.82
        + Math.sin(clock * 0.11 + phase) * drift * 0.2;
    }
  }

  function drawNebula() {
    const blobs = [
      { x: 0.16, y: 0.23, sx: 0.25, sy: 0.30, phase: 0.2, color: '127,230,224', alpha: 0.050 },
      { x: 0.78, y: 0.21, sx: 0.29, sy: 0.34, phase: 2.1, color: '167,139,250', alpha: 0.060 },
      { x: 0.43, y: 0.72, sx: 0.34, sy: 0.30, phase: 4.4, color: '136,182,255', alpha: 0.042 },
      { x: 0.94, y: 0.78, sx: 0.20, sy: 0.25, phase: 1.4, color: '200,241,105', alpha: 0.028 }
    ];
    for (const blob of blobs) {
      const cx = width * blob.x + Math.sin(clock * 0.12 + blob.phase) * width * 0.035;
      const cy = height * blob.y + Math.cos(clock * 0.10 + blob.phase) * height * 0.035;
      const radius = Math.max(80, Math.min(width * blob.sx, height * blob.sy));
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(${blob.color},${blob.alpha})`);
      gradient.addColorStop(0.48, `rgba(${blob.color},${blob.alpha * 0.36})`);
      gradient.addColorStop(1, `rgba(${blob.color},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
  }

  function drawFluidWaves() {
    const waves = [
      { y: 0.15, amp: 15, freq: 0.0042, speed: 0.34, phase: 0.3, color: 'rgba(127,230,224,.14)', line: 1.15 },
      { y: 0.34, amp: 22, freq: 0.0034, speed: -0.26, phase: 2.1, color: 'rgba(167,139,250,.125)', line: 1.0 },
      { y: 0.57, amp: 17, freq: 0.0047, speed: 0.21, phase: 4.2, color: 'rgba(136,182,255,.105)', line: 0.95 },
      { y: 0.81, amp: 19, freq: 0.0038, speed: -0.18, phase: 1.4, color: 'rgba(127,230,224,.09)', line: 0.85 }
    ];
    const visibleWaves = coarseDevice ? waves.slice(0, 3) : waves;
    for (const wave of visibleWaves) {
      ctx.beginPath();
      for (let x = -16; x <= width + 16; x += coarseDevice ? 16 : 10) {
        const slow = Math.sin(x * wave.freq + clock * wave.speed + wave.phase);
        const detail = Math.sin(x * wave.freq * 0.47 - clock * wave.speed * 0.72 + wave.phase * 1.6);
        const y = height * wave.y + slow * Math.min(wave.amp, height * 0.023) + detail * wave.amp * 0.33;
        if (x <= -16) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = wave.line;
      ctx.stroke();
    }
  }

  function drawOrbitRings() {
    ctx.save();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(167,139,250,.055)';
    ctx.beginPath();
    ctx.ellipse(width * 0.52, height * 0.48, width * 0.37, height * 0.25, Math.sin(clock * 0.06) * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(127,230,224,.045)';
    ctx.beginPath();
    ctx.ellipse(width * 0.48, height * 0.52, width * 0.45, height * 0.34, -Math.cos(clock * 0.05) * 0.06, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawConnections() {
    const linkDistance = Math.min(142, Math.max(94, width * 0.105));
    const linkDistanceSq = linkDistance * linkDistance;
    const cols = Math.max(1, Math.ceil(width / linkDistance));
    const rows = Math.max(1, Math.ceil(height / linkDistance));
    const cells = new Map();

    for (const particle of particles) {
      const cx = clamp(Math.floor(particle.x / linkDistance), 0, cols - 1);
      const cy = clamp(Math.floor(particle.y / linkDistance), 0, rows - 1);
      const key = cy * cols + cx;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(particle);
    }

    for (const [key, group] of cells) {
      const cx = key % cols;
      const cy = Math.floor(key / cols);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          const other = cells.get(ny * cols + nx);
          if (!other) continue;
          for (const a of group) for (const b of other) {
            if (a.index >= b.index) continue;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq >= linkDistanceSq) continue;
            const alpha = (1 - Math.sqrt(distanceSq) / linkDistance) * (coarseDevice ? 0.085 : 0.12);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineWidth = 0.55;
            ctx.strokeStyle = `rgba(${a.tone.r},${a.tone.g},${a.tone.b},${alpha})`;
            ctx.stroke();
          }
        }
      }
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      const pulse = 0.64 + Math.sin(clock * 1.45 + particle.phase) * 0.28;
      const radius = particle.radius * (0.9 + pulse * 0.17);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${particle.tone.r},${particle.tone.g},${particle.tone.b},${0.42 * pulse * particle.twinkle})`;
      ctx.fill();
      if (particle.radius > 1.35) {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${particle.tone.r},${particle.tone.g},${particle.tone.b},${0.055 * pulse})`;
        ctx.fill();
      }
    }

    // A few evenly-spaced glints add depth without turning the whole background into noise.
    const glints = coarseDevice ? 4 : 7;
    for (let i = 0; i < glints; i++) {
      const phase = i * 2.17;
      const x = ((i + 0.5) / glints) * width + Math.sin(clock * 0.19 + phase) * width * 0.035;
      const y = height * (0.13 + ((i * 37) % 79) / 100) + Math.cos(clock * 0.15 + phase) * 12;
      const alpha = 0.22 + (Math.sin(clock * 1.2 + phase) + 1) * 0.12;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(221,226,255,${alpha})`;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
      ctx.strokeStyle = `rgba(190,205,255,${alpha * 0.42})`;
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
  }

  function render(now) {
    if (!running) return;
    frame = requestAnimationFrame(render);
    if (now - lastFrame < frameInterval()) return;
    const delta = Math.min(2, lastFrame ? (now - lastFrame) / frameInterval() : 1);
    lastFrame = now;
    clock += delta * 0.018;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    drawNebula();
    drawOrbitRings();
    drawFluidWaves();
    updateParticles();
    drawConnections();
    drawParticles();
    ctx.globalCompositeOperation = 'source-over';
  }

  function stop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function start() {
    if (running || document.hidden) return;
    running = true;
    lastFrame = 0;
    frame = requestAnimationFrame(render);
  }
  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  function onMotionChange(event) {
    if (event.matches) {
      stop();
      canvas.hidden = true;
      ctx.clearRect(0, 0, width, height);
    } else {
      canvas.hidden = false;
      resize();
      start();
    }
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility, { passive: true });
  motionQuery?.addEventListener?.('change', onMotionChange);
  frame = requestAnimationFrame(render);
})();
