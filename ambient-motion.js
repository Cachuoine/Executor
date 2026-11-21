/**
 * NightReaper — AURORA PRISM / LUMEN FIELD
 * A new full-page atmosphere: flowing aurora curtains, prismatic orbital arcs,
 * distant stars and slow luminous dust. Decorative only; never captures input.
 */
(() => {
  'use strict';
  if (!document.body || document.body.classList?.contains?.('admin-page') || document.querySelector('.ambient-particle-field')) return;

  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.className = 'ambient-particle-field';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  canvas.tabIndex = -1;
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) { canvas.remove(); return; }

  const TAU = Math.PI * 2;
  const palette = [
    { r: 143, g: 121, b: 255 }, // spectral violet
    { r: 102, g: 224, b: 222 }, // glacial teal
    { r: 142, g: 174, b: 255 }, // periwinkle
    { r: 226, g: 164, b: 255 }, // orchid
    { r: 211, g: 236, b: 169 }  // pale lime
  ];
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let width = 1;
  let height = 1;
  let ratio = 1;
  let clock = 0;
  let frame = 0;
  let lastFrame = 0;
  let running = false;
  let coarseDevice = false;
  let pointerX = 0;
  let pointerY = 0;
  let stars = [];
  let dust = [];

  const ribbonSpecs = [
    { x: .10, amplitude: .075, width: .045, speed: .18, phase: .3, hue: 0 },
    { x: .28, amplitude: .055, width: .035, speed: -.14, phase: 2.1, hue: 1 },
    { x: .49, amplitude: .082, width: .052, speed: .12, phase: 4.2, hue: 2 },
    { x: .72, amplitude: .064, width: .040, speed: -.16, phase: 1.4, hue: 3 },
    { x: .91, amplitude: .070, width: .047, speed: .13, phase: 5.1, hue: 1 }
  ];

  function makeSpecks(count, kind) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * width / Math.max(1, height))));
    const rows = Math.max(1, Math.ceil(count / columns));
    const cellW = width / columns;
    const cellH = height / rows;
    return Array.from({ length: count }, (_, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const tone = palette[Math.floor(Math.random() * palette.length)];
      return {
        x: clamp((col + rand(.18, .82)) * cellW, 2, width - 2),
        y: clamp((row + rand(.18, .82)) * cellH, 2, height - 2),
        phase: rand(0, TAU),
        radius: kind === 'star' ? rand(.45, 1.4) : rand(.8, 2.1),
        tone,
        speed: rand(.45, 1.1),
        drift: rand(.08, .34),
        index
      };
    });
  }

  function resize() {
    const oldW = width;
    const oldH = height;
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    coarseDevice = Boolean(window.matchMedia?.('(pointer: coarse)').matches || width <= 760);
    ratio = Math.min(window.devicePixelRatio || 1, coarseDevice ? 1 : 1.2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (stars.length && oldW > 1 && oldH > 1) {
      for (const item of [...stars, ...dust]) {
        item.x = clamp(item.x / oldW * width, 2, width - 2);
        item.y = clamp(item.y / oldH * height, 2, height - 2);
      }
    }
    const starCount = coarseDevice ? 66 : 132;
    const dustCount = coarseDevice ? 22 : 46;
    if (stars.length !== starCount) stars = makeSpecks(starCount, 'star');
    if (dust.length !== dustCount) dust = makeSpecks(dustCount, 'dust');
  }

  function drawLightVolumes() {
    const offsetX = pointerX * (coarseDevice ? 0 : 18);
    const offsetY = pointerY * (coarseDevice ? 0 : 12);
    const lights = [
      { x: width * .18 + offsetX, y: height * .20 + offsetY, rx: width * .42, ry: height * .46, color: 'rgba(118,91,255,.19)' },
      { x: width * .77 - offsetX * .7, y: height * .43 - offsetY, rx: width * .34, ry: height * .54, color: 'rgba(75,207,204,.13)' },
      { x: width * .49 + offsetX * .35, y: height * .88, rx: width * .42, ry: height * .28, color: 'rgba(176,108,255,.10)' }
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const light of lights) {
      const radius = Math.max(light.rx, light.ry);
      const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
      gradient.addColorStop(0, light.color);
      gradient.addColorStop(.38, light.color.replace(/\.\d+\)/, '.045)'));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(light.x, light.y, light.rx, light.ry, -.18, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function ribbonX(spec, y, edge = 0) {
    const travel = clock * spec.speed + spec.phase;
    const waveA = Math.sin(y * .0025 + travel) * height * spec.amplitude;
    const waveB = Math.sin(y * .0062 - travel * .73 + spec.phase) * height * spec.amplitude * .24;
    const waveC = Math.sin(y * .0011 + travel * .46) * width * .012;
    return width * spec.x + waveA + waveB + waveC + edge;
  }

  function drawAuroraCurtains() {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const step = coarseDevice ? 34 : 22;
    for (const spec of ribbonSpecs) {
      const baseX = width * spec.x;
      const half = Math.max(12, width * spec.width);
      const gradient = ctx.createLinearGradient(baseX - half, 0, baseX + half, height);
      gradient.addColorStop(0, 'rgba(135,119,255,0)');
      gradient.addColorStop(.18, spec.hue === 1 ? 'rgba(91,225,218,.025)' : 'rgba(157,125,255,.035)');
      gradient.addColorStop(.46, spec.hue === 2 ? 'rgba(130,172,255,.12)' : 'rgba(174,136,255,.105)');
      gradient.addColorStop(.72, spec.hue === 3 ? 'rgba(222,148,255,.075)' : 'rgba(105,220,215,.075)');
      gradient.addColorStop(1, 'rgba(120,105,255,0)');

      const left = [];
      const right = [];
      for (let y = -40; y <= height + 40; y += step) {
        const center = ribbonX(spec, y);
        const shape = half * (.72 + .28 * Math.sin(y * .0036 + clock * spec.speed * 1.7 + spec.phase));
        left.push([center - shape, y]);
        right.push([center + shape, y]);
      }
      ctx.beginPath();
      if (left.length) ctx.moveTo(left[0][0], left[0][1]);
      for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // A pair of fine silk edges makes each curtain read as a luminous ribbon.
      for (const sign of [-.48, .48]) {
        ctx.beginPath();
        for (let y = -30, first = true; y <= height + 30; y += step) {
          const x = ribbonX(spec, y, half * sign);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        const edgeGradient = ctx.createLinearGradient(baseX, 0, baseX, height);
        edgeGradient.addColorStop(0, 'rgba(144,132,255,0)');
        edgeGradient.addColorStop(.34, 'rgba(153,151,255,.11)');
        edgeGradient.addColorStop(.66, 'rgba(118,237,226,.18)');
        edgeGradient.addColorStop(1, 'rgba(144,132,255,0)');
        ctx.strokeStyle = edgeGradient;
        ctx.lineWidth = coarseDevice ? .8 : 1.15;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPrismOrbits() {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cx = width * .57 + pointerX * 9;
    const cy = height * .43 + pointerY * 7;
    const rings = [
      { rx: width * .34, ry: height * .19, rotation: -.25, color: 'rgba(143,128,255,.18)', speed: .045, offset: 0 },
      { rx: width * .27, ry: height * .25, rotation: .52, color: 'rgba(104,222,218,.14)', speed: -.036, offset: 2.1 },
      { rx: width * .40, ry: height * .12, rotation: -.62, color: 'rgba(215,164,255,.12)', speed: .027, offset: 4.3 },
      { rx: width * .20, ry: height * .30, rotation: .18, color: 'rgba(145,185,255,.095)', speed: -.022, offset: 1.2 }
    ];
    for (const ring of rings) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(40, ring.rx), Math.max(28, ring.ry), ring.rotation + Math.sin(clock * ring.speed + ring.offset) * .035, 0, TAU);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1;
      ctx.stroke();
      const angle = clock * ring.speed + ring.offset;
      const pointX = cx + Math.cos(angle) * ring.rx * Math.cos(ring.rotation) - Math.sin(angle) * ring.ry * Math.sin(ring.rotation);
      const pointY = cy + Math.cos(angle) * ring.rx * Math.sin(ring.rotation) + Math.sin(angle) * ring.ry * Math.cos(ring.rotation);
      const glow = ctx.createRadialGradient(pointX, pointY, 0, pointX, pointY, coarseDevice ? 13 : 20);
      glow.addColorStop(0, 'rgba(217,239,255,.72)');
      glow.addColorStop(.25, ring.color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pointX, pointY, coarseDevice ? 13 : 20, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStarfield() {
    ctx.save();
    for (const star of stars) {
      const pulse = .34 + (.5 + .5 * Math.sin(clock * star.speed + star.phase)) * .56;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = `rgba(${star.tone.r},${star.tone.g},${star.tone.b},.78)`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, TAU);
      ctx.fill();
      if (star.radius > 1.05 && pulse > .68) {
        const ray = star.radius * 3.4;
        ctx.globalAlpha = pulse * .34;
        ctx.strokeStyle = `rgba(${star.tone.r},${star.tone.g},${star.tone.b},.5)`;
        ctx.lineWidth = .65;
        ctx.beginPath();
        ctx.moveTo(star.x - ray, star.y); ctx.lineTo(star.x + ray, star.y);
        ctx.moveTo(star.x, star.y - ray); ctx.lineTo(star.x, star.y + ray);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLuminousDust(delta) {
    const linkRange = coarseDevice ? 82 : 112;
    const rangeSq = linkRange * linkRange;
    for (const item of dust) {
      const flow = clock * item.speed + item.phase;
      item.x += Math.cos(flow) * item.drift * delta;
      item.y += Math.sin(flow * .83 + item.x * .001) * item.drift * .8 * delta;
      if (item.x < 0) item.x = width; else if (item.x > width) item.x = 0;
      if (item.y < 0) item.y = height; else if (item.y > height) item.y = 0;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < dust.length; i++) {
      const a = dust[i];
      for (let j = i + 1; j < dust.length; j++) {
        const b = dust[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > rangeSq) continue;
        const alpha = (1 - Math.sqrt(distSq) / linkRange) * .10;
        ctx.strokeStyle = `rgba(${a.tone.r},${a.tone.g},${a.tone.b},${alpha})`;
        ctx.lineWidth = .55;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const pulse = .45 + .35 * Math.sin(clock * 1.15 + a.phase);
      ctx.fillStyle = `rgba(${a.tone.r},${a.tone.g},${a.tone.b},${pulse * .55})`;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.radius * 1.25, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawMeteorTraces() {
    const count = coarseDevice ? 1 : 3;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let index = 0; index < count; index++) {
      const cycle = (clock * (.018 + index * .004) + index * .37) % 1;
      if (cycle > .28) continue;
      const t = cycle / .28;
      const x = width * (.10 + index * .29) + t * width * .36;
      const y = height * (.10 + index * .12) + t * height * (.20 + index * .04);
      const length = coarseDevice ? 22 : 42;
      const grad = ctx.createLinearGradient(x - length, y - length * .45, x, y);
      grad.addColorStop(0, 'rgba(160,155,255,0)');
      grad.addColorStop(1, 'rgba(214,244,255,.62)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.15;
      ctx.beginPath(); ctx.moveTo(x - length, y - length * .45); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = 'rgba(224,248,255,.78)';
      ctx.beginPath(); ctx.arc(x, y, 1.25, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function renderFrame(now, staticFrame = false) {
    const frameInterval = coarseDevice ? 1000 / 20 : 1000 / 30;
    if (!staticFrame && lastFrame && now - lastFrame < frameInterval) return;
    const delta = Math.min(2.2, lastFrame ? Math.max(.5, (now - lastFrame) / frameInterval) : 1);
    lastFrame = now;
    if (!staticFrame) clock += delta * .018;
    ctx.clearRect(0, 0, width, height);
    drawLightVolumes();
    drawAuroraCurtains();
    drawPrismOrbits();
    drawStarfield();
    drawLuminousDust(delta);
    if (!staticFrame) drawMeteorTraces();
  }

  function tick(now) {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    renderFrame(now);
  }
  function stop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function start() {
    if (motionQuery?.matches) { renderFrame(0, true); return; }
    if (running || document.hidden) return;
    running = true;
    lastFrame = 0;
    frame = requestAnimationFrame(tick);
  }
  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  function onMotionChange(event) {
    if (event.matches) {
      stop();
      renderFrame(0, true);
    } else {
      resize();
      start();
    }
  }
  function onPointerMove(event) {
    if (coarseDevice) return;
    pointerX = clamp((event.clientX / Math.max(1, width) - .5) * 2, -1, 1);
    pointerY = clamp((event.clientY / Math.max(1, height) - .5) * 2, -1, 1);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibility, { passive: true });
  motionQuery?.addEventListener?.('change', onMotionChange);
  start();
})();
