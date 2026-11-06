/* EXECUTOR v15.2.7 — ambient fluid waves + connected particles.
 * Decorative only: no pointer capture, no network calls, and no layout impact.
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

  let width = 1, height = 1, ratio = 1;
  let particles = [], frame = 0, lastFrame = 0, running = true, clock = 0;
  const FRAME_MS = 1000 / 30;
  const palette = [
    { r: 127, g: 230, b: 224 },
    { r: 167, g: 139, b: 250 },
    { r: 136, g: 182, b: 255 },
    { r: 200, g: 241, b: 105 }
  ];
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function createParticle(x, y, index = 0) {
    const tone = palette[Math.floor(Math.random() * palette.length)];
    return {
      x: Number.isFinite(x) ? x : rand(0, width),
      y: Number.isFinite(y) ? y : rand(0, height),
      vx: rand(-0.34, 0.34), vy: rand(-0.28, 0.28),
      r: rand(0.72, 1.82), phase: rand(0, Math.PI * 2), tone,
      twinkle: rand(0.38, 1), index
    };
  }

  function seedSpreadParticles(count) {
    // Stratified sampling gives every region its own particles instead of allowing
    // random initialization to create conspicuous clumps in the center.
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * width / Math.max(1, height))));
    const rows = Math.max(1, Math.ceil(count / columns));
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    particles = Array.from({ length: count }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = clamp((column + 0.5) * cellWidth + rand(-cellWidth * 0.36, cellWidth * 0.36), 2, Math.max(2, width - 2));
      const y = clamp((row + 0.5) * cellHeight + rand(-cellHeight * 0.36, cellHeight * 0.36), 2, Math.max(2, height - 2));
      return createParticle(x, y, index);
    });
  }

  function resize() {
    const previousWidth = width;
    const previousHeight = height;
    const nextWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const nextHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    if (particles.length && previousWidth > 1 && previousHeight > 1) {
      for (const particle of particles) {
        particle.x = clamp((particle.x / previousWidth) * nextWidth, 2, Math.max(2, nextWidth - 2));
        particle.y = clamp((particle.y / previousHeight) * nextHeight, 2, Math.max(2, nextHeight - 2));
      }
    }
    width = nextWidth;
    height = nextHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 1.35);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // More particles, distributed across the whole viewport and capped for performance.
    const count = Math.max(88, Math.min(360, Math.round((width * height) / 5200)));
    if (particles.length !== count) seedSpreadParticles(count);
  }

  function drawFluidWaves() {
    const waves = [
      { y: .19, amp: 14, freq: .0049, speed: .43, phase: .4, color: 'rgba(127,230,224,.105)', line: 1.05 },
      { y: .37, amp: 19, freq: .0037, speed: -.31, phase: 2.2, color: 'rgba(167,139,250,.09)', line: 1.0 },
      { y: .59, amp: 12, freq: .0062, speed: .26, phase: 4.1, color: 'rgba(136,182,255,.072)', line: .9 },
      { y: .82, amp: 16, freq: .0045, speed: -.22, phase: 1.4, color: 'rgba(127,230,224,.065)', line: .85 }
    ];
    for (const wave of waves) {
      ctx.beginPath();
      for (let x = -12; x <= width + 12; x += 7) {
        const y = height * wave.y
          + Math.sin(x * wave.freq + clock * wave.speed + wave.phase) * Math.min(wave.amp, height * .022)
          + Math.sin(x * wave.freq * .43 - clock * wave.speed * .8 + wave.phase * 1.7) * wave.amp * .34;
        if (x <= -12) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = wave.line;
      ctx.stroke();
    }
  }

  function drawParticles(delta) {
    const linkDistance = Math.min(148, Math.max(92, width * .105));
    const linkDistanceSq = linkDistance * linkDistance;
    const cellSize = linkDistance;
    const cols = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(height / cellSize));
    const cells = new Map();

    for (const p of particles) {
      // A gentle flowing vector field makes paths curve like water rather than move linearly.
      const flow = clock * .34 + p.phase + p.y * .0032;
      p.vx = clamp(p.vx + Math.sin(flow) * .0022 * delta, -.43, .43);
      p.vy = clamp(p.vy + Math.cos(flow * .83 + p.x * .002) * .0018 * delta, -.36, .36);
      p.x += p.vx * delta;
      p.y += p.vy * delta + Math.sin(clock * .56 + p.phase + p.x * .002) * .075 * delta;
      if (p.x < -8) p.x = width + 8; else if (p.x > width + 8) p.x = -8;
      if (p.y < -8) p.y = height + 8; else if (p.y > height + 8) p.y = -8;
      const cx = clamp(Math.floor(p.x / cellSize), 0, cols - 1);
      const cy = clamp(Math.floor(p.y / cellSize), 0, rows - 1);
      const key = cy * cols + cx;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(p);
    }

    // Soft separation prevents particles from drifting into visible clumps. The force is
    // intentionally slight so their paths still feel fluid rather than like a rigid grid.
    const minGap = 27;
    const minGapSq = minGap * minGap;
    for (const [key, group] of cells) {
      const cx = key % cols, cy = Math.floor(key / cols);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const other = cells.get(ny * cols + nx);
        if (!other) continue;
        for (const a of group) for (const b of other) {
          if (a.index >= b.index) continue;
          let dx = a.x - b.x, dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 0.01 || distSq >= minGapSq) continue;
          const dist = Math.sqrt(distSq);
          const push = ((minGap - dist) / minGap) * 0.12;
          dx /= dist; dy /= dist;
          a.x += dx * push; a.y += dy * push;
          b.x -= dx * push; b.y -= dy * push;
        }
      }
    }

    // Spatial grid keeps the dense field inexpensive: compare only neighbouring cells.
    for (const [key, group] of cells) {
      const cx = key % cols, cy = Math.floor(key / cols);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const other = cells.get(ny * cols + nx);
        if (!other) continue;
        for (const a of group) for (const b of other) {
          if (a === b || (a.y > b.y || (a.y === b.y && a.x >= b.x))) continue;
          const dx = a.x - b.x, dy = a.y - b.y, distSq = dx * dx + dy * dy;
          if (distSq >= linkDistanceSq) continue;
          const alpha = (1 - Math.sqrt(distSq) / linkDistance) * .15;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.lineWidth = .52;
          ctx.strokeStyle = `rgba(${a.tone.r},${a.tone.g},${a.tone.b},${alpha})`;
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      const pulse = .63 + Math.sin(clock * 1.2 + p.phase) * .23;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (.88 + pulse * .2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.tone.r},${p.tone.g},${p.tone.b},${.34 * pulse * p.twinkle})`;
      ctx.fill();
      if (p.r > 1.35) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.tone.r},${p.tone.g},${p.tone.b},${.045 * pulse})`;
        ctx.fill();
      }
    }
  }

  function render(now) {
    if (!running) return;
    frame = requestAnimationFrame(render);
    if (now - lastFrame < FRAME_MS) return;
    const delta = Math.min(1.8, lastFrame ? (now - lastFrame) / FRAME_MS : 1);
    lastFrame = now;
    clock += delta * .018;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    drawFluidWaves();
    drawParticles(delta);
    ctx.globalCompositeOperation = 'source-over';
  }

  function stop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function start() {
    if (running) return;
    running = true; lastFrame = 0;
    frame = requestAnimationFrame(render);
  }
  function onVisibility() { if (document.hidden) stop(); else start(); }
  function onMotionChange(event) {
    if (event.matches) { stop(); canvas.hidden = true; ctx.clearRect(0, 0, width, height); }
    else { canvas.hidden = false; resize(); start(); }
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility, { passive: true });
  motionQuery?.addEventListener?.('change', onMotionChange);
  frame = requestAnimationFrame(render);
})();
