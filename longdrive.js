// Endless Drive — an original, self-contained chill driving game.
// Paste into the browser console on any page. Esc quits.
(() => {
  if (window.__drive) window.__drive.stop();

  // ---------- canvas overlay ----------
  const host = document.body || document.documentElement;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;cursor:default';
  const cv = document.createElement('canvas');
  cv.style.cssText = 'width:100%;height:100%;display:block';
  wrap.appendChild(cv);
  host.appendChild(wrap);
  const ctx = cv.getContext('2d');

  let W = 0, H = 0, DPR = 1;
  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.width = Math.floor(innerWidth * DPR);
    H = cv.height = Math.floor(innerHeight * DPR);
  };
  resize();
  addEventListener('resize', resize);

  // ---------- world ----------
  const SEG = 200, ROAD = 2000, CAMH = 1000, DRAW = 300;
  const DEPTH = 1 / Math.tan(50 * Math.PI / 180);
  const PLAYERZ = CAMH * DEPTH;
  const MAXS = SEG * 60;

  // Procedural road: curves and hills from layered sine waves (infinite, no storage)
  const curve = i =>
    4 * Math.sin(i * 0.0053) * Math.max(0, Math.sin(i * 0.0021 + 0.7)) +
    2.5 * Math.sin(i * 0.0147 + 1.3) * Math.max(0, Math.sin(i * 0.0033 + 2));
  const hill = i =>
    3200 * Math.sin(i * 0.0041) + 1300 * Math.sin(i * 0.0109 + 2.1) + 250 * Math.sin(i * 0.031 + 0.4);
  const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---------- colors / time of day ----------
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const PAL = [
    { // day
      top: [70, 140, 220], hor: [190, 225, 250], grass1: [96, 163, 86], grass2: [88, 152, 79],
      road1: [110, 110, 112], road2: [104, 104, 106], rum1: [235, 235, 235], rum2: [200, 60, 50],
      lane: [240, 240, 240], hills1: [120, 160, 140], hills2: [90, 135, 105], sun: [255, 250, 220] },
    { // dusk
      top: [60, 60, 130], hor: [250, 160, 100], grass1: [70, 110, 60], grass2: [64, 102, 55],
      road1: [80, 76, 80], road2: [76, 72, 76], rum1: [210, 200, 200], rum2: [170, 60, 50],
      lane: [230, 220, 210], hills1: [120, 90, 120], hills2: [85, 70, 100], sun: [255, 190, 120] },
    { // night
      top: [6, 8, 20], hor: [25, 32, 62], grass1: [22, 40, 30], grass2: [19, 36, 27],
      road1: [36, 36, 40], road2: [33, 33, 37], rum1: [120, 120, 130], rum2: [90, 30, 30],
      lane: [170, 170, 150], hills1: [25, 30, 55], hills2: [18, 22, 42], sun: [230, 235, 255] },
    { // dawn
      top: [90, 110, 180], hor: [245, 190, 170], grass1: [80, 130, 75], grass2: [74, 122, 69],
      road1: [95, 92, 98], road2: [90, 87, 93], rum1: [225, 220, 220], rum2: [185, 65, 55],
      lane: [235, 230, 225], hills1: [140, 130, 160], hills2: [110, 105, 135], sun: [255, 220, 180] },
  ];
  const mixPal = (a, b, f) => { const o = {}; for (const k in a) o[k] = mix(a[k], b[k], f); return o; };
  const stars = Array.from({ length: 160 }, (_, k) => [hash(k, 1), hash(k, 2) * 0.5, 0.5 + hash(k, 3) * 1.5]);

  // ---------- state ----------
  let pos = 0, speed = 0, px = 0, auto = false, skyOff = 0, clock = 0, hud = true;
  let steerVis = 0, braking = false, night = 0, P = PAL[0];
  let touchGas = false, touchDir = 0;
  const keys = {};

  // ---------- input ----------
  const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
                ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const kd = e => {
    if (e.code === 'Escape') { e.preventDefault(); stop(); return; }
    if (e.code === 'Space') { if (!e.repeat) auto = !auto; }
    else if (e.code === 'KeyH') { if (!e.repeat) hud = !hud; }
    else if (map[e.code]) keys[map[e.code]] = true;
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  const ku = e => {
    if (!map[e.code]) return;
    keys[map[e.code]] = false;
    e.preventDefault(); e.stopPropagation();
  };
  addEventListener('keydown', kd, true);
  addEventListener('keyup', ku, true);

  const pd = e => {
    touchGas = true;
    const x = e.clientX / innerWidth;
    touchDir = x < 0.33 ? -1 : x > 0.67 ? 1 : 0;
  };
  const pu = () => { touchGas = false; touchDir = 0; };
  wrap.addEventListener('pointerdown', e => { try { wrap.setPointerCapture(e.pointerId); } catch (_) {} pd(e); });
  wrap.addEventListener('pointermove', e => { if (touchGas) pd(e); });
  wrap.addEventListener('pointerup', pu);
  wrap.addEventListener('pointercancel', pu);

  // ---------- update ----------
  function update(dt) {
    const sp = speed / MAXS;
    const left = keys.left || touchDir < 0, right = keys.right || touchDir > 0;
    const gas = keys.up || touchGas || (auto && !keys.down && speed < MAXS * 0.7);
    const pi = Math.floor((pos + PLAYERZ) / SEG);
    const d = dt * 2 * sp;

    if (left) px -= d;
    if (right) px += d;
    if (auto && !left && !right) px += (0.45 - px) * Math.min(1, dt * 1.5); // hold right lane
    else px -= d * sp * curve(pi) * 0.3; // curves push you outward

    steerVis += ((right ? 1 : 0) - (left ? 1 : 0) - steerVis) * Math.min(1, dt * 8);
    braking = !!keys.down && speed > 0;

    if (gas) speed += (MAXS / 5) * dt;
    else if (keys.down) speed -= MAXS * dt;
    else speed -= (MAXS / 5) * dt;
    if (Math.abs(px) > 1.1 && speed > MAXS / 4) speed -= (MAXS / 2) * dt; // grass slows you

    speed = Math.max(0, Math.min(MAXS, speed));
    px = Math.max(-2.5, Math.min(2.5, px));
    pos += speed * dt;
    skyOff += 0.001 * curve(pi) * speed * dt / SEG;
    clock += dt;

    // time of day: ~75s per phase, smooth blend at the end of each
    const p = (clock / 75) % 4, i = Math.floor(p);
    const f = Math.max(0, (p - i - 0.6) / 0.4), s = f * f * (3 - 2 * f);
    P = mixPal(PAL[i], PAL[(i + 1) % 4], s);
    night = i === 2 ? 1 - s : i === 1 ? s : 0;
  }

  // ---------- drawing helpers ----------
  const quad = (c, x1, y1, w1, x2, y2, w2) => {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1);
    ctx.fill();
  };
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    ctx.fill();
  };

  function drawTree(x, y, h, pine, fog) {
    if (h < 2 || x < -h || x > W + h) return;
    ctx.fillStyle = rgb(mix(mix([92, 64, 44], [20, 18, 25], night * 0.6), P.hor, fog));
    ctx.fillRect(x - h * 0.04, y - h * 0.3, h * 0.08, h * 0.3);
    ctx.fillStyle = rgb(mix(mix(pine ? [40, 95, 55] : [70, 130, 60], [15, 30, 30], night * 0.7), P.hor, fog));
    ctx.beginPath();
    if (pine) {
      for (let t = 0; t < 3; t++) {
        const yb = y - h * (0.2 + t * 0.25), w = h * (0.32 - t * 0.07);
        ctx.moveTo(x - w, yb); ctx.lineTo(x, yb - h * 0.4); ctx.lineTo(x + w, yb);
      }
    } else {
      ctx.arc(x, y - h * 0.62, h * 0.3, 0, 7);
      ctx.moveTo(x - h * 0.18 + h * 0.22, y - h * 0.45); ctx.arc(x - h * 0.18, y - h * 0.45, h * 0.22, 0, 7);
      ctx.moveTo(x + h * 0.18 + h * 0.22, y - h * 0.47); ctx.arc(x + h * 0.18, y - h * 0.47, h * 0.22, 0, 7);
    }
    ctx.fill();
  }

  function drawPost(x, y, kk, fog) {
    const h = kk * 300, w = Math.max(1, kk * 35);
    if (h < 2 || x < -w || x > W + w) return;
    ctx.fillStyle = rgb(mix(mix([235, 235, 235], [70, 70, 80], night * 0.6), P.hor, fog));
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = rgb(mix([230, 90, 40], P.hor, fog));
    ctx.fillRect(x - w / 2, y - h, w, h * 0.18);
  }

  function ridge(off, amp, f1, col, hor) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let k = 0; k <= 96; k++) {
      const u = k / 96 + off;
      const y = hor - amp * (0.55 + 0.25 * Math.sin(u * f1 * 6.2832) + 0.2 * Math.sin(u * (f1 * 2 + 1) * 6.2832 + 1.7));
      ctx.lineTo((k / 96) * W, y);
    }
    ctx.lineTo(W, H); ctx.fill();
  }

  function drawCar() {
    const cw = Math.min(W * 0.2, H * 0.36), ch = cw * 0.45;
    const bounce = Math.sin(clock * 30) * DPR * (speed / MAXS) * 1.2;
    const cx = W / 2 + steerVis * cw * 0.05, by = H - H * 0.05 + bounce;
    const body = mix([38, 150, 165], [10, 18, 30], night * 0.55);
    const dark = mix(body, [0, 0, 0], 0.35);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, by + ch * 0.05, cw * 0.56, ch * 0.13, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#121214';
    rr(cx - cw * 0.47, by - ch * 0.3, cw * 0.15, ch * 0.32, ch * 0.05);
    rr(cx + cw * 0.32, by - ch * 0.3, cw * 0.15, ch * 0.32, ch * 0.05);

    // cabin + rear glass
    const lean = steerVis * cw * 0.015;
    ctx.fillStyle = rgb(dark); ctx.beginPath();
    ctx.moveTo(cx - cw * 0.4, by - ch * 0.72); ctx.lineTo(cx - cw * 0.29 + lean, by - ch * 1.12);
    ctx.lineTo(cx + cw * 0.29 + lean, by - ch * 1.12); ctx.lineTo(cx + cw * 0.4, by - ch * 0.72); ctx.fill();
    ctx.fillStyle = rgb(mix(mix([120, 170, 200], P.top, 0.4), [5, 8, 15], night * 0.6)); ctx.beginPath();
    ctx.moveTo(cx - cw * 0.34, by - ch * 0.76); ctx.lineTo(cx - cw * 0.26 + lean, by - ch * 1.06);
    ctx.lineTo(cx + cw * 0.26 + lean, by - ch * 1.06); ctx.lineTo(cx + cw * 0.34, by - ch * 0.76); ctx.fill();

    // body, bumper, plate
    ctx.fillStyle = rgb(body); rr(cx - cw / 2, by - ch * 0.78, cw, ch * 0.62, ch * 0.14);
    ctx.fillStyle = rgb(dark); rr(cx - cw * 0.46, by - ch * 0.28, cw * 0.92, ch * 0.14, ch * 0.05);
    ctx.fillStyle = '#e8e8e0'; rr(cx - cw * 0.09, by - ch * 0.6, cw * 0.18, ch * 0.13, ch * 0.02);

    // tail lights
    const lit = braking || night > 0.3;
    ctx.save();
    if (lit) { ctx.shadowColor = '#ff3020'; ctx.shadowBlur = (braking ? 28 : 14) * DPR; }
    ctx.fillStyle = braking ? '#ff3b30' : lit ? '#e0352a' : '#a8241c';
    rr(cx - cw * 0.45, by - ch * 0.66, cw * 0.2, ch * 0.12, ch * 0.04);
    rr(cx + cw * 0.25, by - ch * 0.66, cw * 0.2, ch * 0.12, ch * 0.04);
    ctx.restore();
  }

  // ---------- render ----------
  function render() {
    const hor = H / 2, k = W / 2;

    // sky, stars, sun/moon, distant hills
    const g = ctx.createLinearGradient(0, 0, 0, hor);
    g.addColorStop(0, rgb(P.top)); g.addColorStop(1, rgb(P.hor));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (night > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${night * 0.9})`;
      for (const [sx, sy, r] of stars) {
        const x = ((((sx - skyOff * 0.2) % 1) + 1) % 1) * W;
        ctx.fillRect(x, sy * H, r * DPR, r * DPR);
      }
    }
    const sx = ((((0.72 - skyOff * 0.3) % 1) + 1) % 1) * W, sy = H * 0.18;
    const R = Math.min(W, H) * 0.045;
    const sg = ctx.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 4);
    sg.addColorStop(0, `rgba(${P.sun[0] | 0},${P.sun[1] | 0},${P.sun[2] | 0},0.5)`);
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - R * 4, sy - R * 4, R * 8, R * 8);
    ctx.fillStyle = rgb(P.sun); ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill();
    ridge(skyOff * 0.5, H * 0.12, 2, rgb(mix(P.hills1, P.hor, 0.45)), hor);
    ridge(skyOff * 1.0, H * 0.07, 3, rgb(mix(P.hills2, P.hor, 0.2)), hor);

    // project road segments (near -> far)
    const base = Math.floor(pos / SEG), pct = (pos % SEG) / SEG;
    const pi = Math.floor((pos + PLAYERZ) / SEG), pp = ((pos + PLAYERZ) % SEG) / SEG;
    const camY = CAMH + hill(pi) + (hill(pi + 1) - hill(pi)) * pp;
    const camX = px * ROAD;
    const proj = (wx, wy, wz) => {
      const s = DEPTH / wz;
      return { x: k + s * (wx - camX) * k, y: hor - s * (wy - camY) * k, w: s * ROAD * k, s };
    };
    const segs = new Array(DRAW);
    let x = 0, dx = -curve(base) * pct;
    for (let n = 0; n < DRAW; n++) {
      const i = base + n, z1 = i * SEG - pos;
      segs[n] = { i, z1, p1: proj(x, hill(i), z1), p2: proj(x + dx, hill(i + 1), z1 + SEG) };
      x += dx; dx += curve(i);
    }

    // draw far -> near (painter's order handles hills + scenery occlusion)
    for (let n = DRAW - 1; n >= 1; n--) {
      const { i, z1, p1, p2 } = segs[n];
      if (z1 <= 1) continue;
      const top = p2.y, bot = p1.y;
      if (top >= H) continue;
      const fog = 1 - Math.exp(-(((n / DRAW) * 2.6) ** 2));
      const F = c => rgb(fog > 0.003 ? mix(c, P.hor, fog) : c);
      const alt = Math.floor(i / 3) % 2 === 0;

      if (bot > top) {
        ctx.fillStyle = F(alt ? P.grass1 : P.grass2);
        ctx.fillRect(0, top, W, bot - top + 1);
        quad(F(alt ? P.rum1 : P.rum2), p1.x, bot + 1, p1.w * 1.15, p2.x, top, p2.w * 1.15);
        quad(F(alt ? P.road1 : P.road2), p1.x, bot + 1, p1.w, p2.x, top, p2.w);
        if (alt) quad(F(P.lane), p1.x, bot + 1, p1.w * 0.025, p2.x, top, p2.w * 0.025);
      }

      // scenery
      const kk = p1.s * k;
      if (i % 8 === 0) { drawPost(p1.x - 1.22 * p1.w, bot, kk, fog); drawPost(p1.x + 1.22 * p1.w, bot, kk, fog); }
      for (let j = 0; j < 2; j++) {
        if (hash(i, 5 + j * 10) < (j ? 0.08 : 0.22)) {
          const side = (hash(i, 6) < 0.5 ? -1 : 1) * (j ? -1 : 1);
          const off = side * (1.35 + hash(i, 7 + j * 10) * 2.6);
          drawTree(p1.x + off * p1.w, bot, kk * (1300 + hash(i, 8 + j * 10) * 900), hash(i, 9 + j * 10) < 0.5, fog);
        }
      }
    }

    // headlights at night
    if (night > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const hg = ctx.createRadialGradient(W / 2, H * 0.78, 0, W / 2, H * 0.78, W * 0.35);
      hg.addColorStop(0, `rgba(255,235,190,${0.22 * night})`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg; ctx.fillRect(0, hor, W, H - hor);
      ctx.restore();
    }

    drawCar();

    if (hud) {
      const fs = 14 * DPR, font = '-apple-system, system-ui, sans-serif';
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6 * DPR;
      ctx.textAlign = 'left';
      ctx.font = `600 ${fs * 1.7}px ${font}`;
      ctx.fillText(`${Math.round((speed / MAXS) * 100)} mph`, 20 * DPR, 42 * DPR);
      ctx.font = `${fs}px ${font}`;
      ctx.fillText(`${(pos / 160000).toFixed(1)} mi${auto ? '  ·  AUTODRIVE' : ''}`, 20 * DPR, 64 * DPR);
      ctx.globalAlpha = 0.75;
      ctx.fillText('↑/W gas  ↓/S brake  ←→/AD steer  ·  Space autodrive  ·  H hide  ·  Esc quit', 20 * DPR, H - 20 * DPR);
      ctx.restore();
    }
  }

  // ---------- loop ----------
  let raf, last = performance.now();
  const frame = t => {
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function stop() {
    cancelAnimationFrame(raf);
    removeEventListener('keydown', kd, true);
    removeEventListener('keyup', ku, true);
    removeEventListener('resize', resize);
    wrap.remove();
    delete window.__drive;
  }
  window.__drive = { stop };
  console.log('Endless Drive running — click the page, then drive. Esc to quit.');
})();
