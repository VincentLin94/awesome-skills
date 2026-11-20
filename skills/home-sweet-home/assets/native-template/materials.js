/* 程序化材质：所有纹理都在 Canvas 上实时绘制，零外部图片。
 * 关键技巧：tri() 把贴图改为按世界坐标投影（不随盒子拉伸），并用贴图亮度做微凹凸，
 * 让硅藻泥、木纹、石材、织物在近看时有真实的颗粒和起伏。
 */
(function () {
  let seed = 20261022;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  const R = (a, b) => a + (b - a) * rnd();
  const cl = v => (v < 0 ? 0 : v > 255 ? 255 : v);

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return [c, c.getContext('2d')]; }

  // 可平铺的分形噪声（周期网格 + smoothstep 插值）
  function fbm(W, H, cx0, cy0, oct, gain) {
    const out = new Float32Array(W * H);
    let amp = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      const cx = cx0 << o, cy = cy0 << o;
      const g = new Float32Array(cx * cy);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      for (let y = 0; y < H; y++) {
        const fy = y / H * cy, y0 = fy | 0, ty = fy - y0, y1 = (y0 + 1) % cy, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < W; x++) {
          const fx = x / W * cx, x0 = fx | 0, tx = fx - x0, x1 = (x0 + 1) % cx, sx = tx * tx * (3 - 2 * tx);
          const a = g[y0 * cx + x0], b = g[y0 * cx + x1], c = g[y1 * cx + x0], d = g[y1 * cx + x1];
          out[y * W + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
        }
      }
      norm += amp; amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }

  function tex(c, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ---------------------------------------------------------------- 纹理
  // 实木复合地板：2.4m × 1.2m 一张，6 排 20cm 宽板，长短错缝 + 年轮 + 节疤 + 倒角缝
  function floorOak(base, W = 1024, H = 512) {
    const [c, x] = cv(W, H), img = x.createImageData(W, H), d = img.data;
    const streak = fbm(W, H, 2, 22, 4, 0.55), fine = fbm(W, H, 24, 96, 2, 0.5);
    const rows = 6, rh = H / rows, P = [];
    for (let r = 0; r < rows; r++) {
      const cuts = [], start = R(0, W); let acc = 0;
      while (acc < W - 260) { cuts.push((start + acc) % W); acc += R(330, 560); }
      cuts.sort((a, b) => a - b);
      P.push({ cuts, tones: cuts.map(() => [R(-16, 14), R(0, 1), R(0.85, 1.15)]) });
    }
    for (let y = 0; y < H; y++) {
      const r = (y / rh) | 0, ry = y - r * rh, Q = P[r];
      for (let xx = 0; xx < W; xx++) {
        let k = 0; while (k < Q.cuts.length && Q.cuts[k] <= xx) k++;
        const [tone, ph, sat] = Q.tones[k === 0 ? Q.cuts.length - 1 : k - 1];
        const i = y * W + xx;
        const ring = 0.5 + 0.5 * Math.sin((streak[i] * 10 + ph * 6.28 + ry * 0.01) * 6.2832);
        let v = tone + (ring - 0.5) * 20 + (fine[i] - 0.5) * 16 + (rnd() - 0.5) * 5;
        const de = Math.min(ry, rh - ry);
        let e = de < 1.2 ? -46 : de < 2.6 ? -14 : 0;
        for (const cu of Q.cuts) { const dx = Math.abs(xx - cu); if (dx < 1.2) e = Math.min(e, -40); else if (dx < 2.6) e = Math.min(e, -12); }
        d[i * 4] = cl(base[0] + v * sat + e);
        d[i * 4 + 1] = cl(base[1] + v * 0.84 * sat + e);
        d[i * 4 + 2] = cl(base[2] + v * 0.62 * sat + e * 0.9);
        d[i * 4 + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    for (let k = 0; k < 9; k++) {
      const kx = R(0, W), ky = R(0, H), rx = R(5, 11), ry = rx * 0.45;
      const g = x.createRadialGradient(kx, ky, 0, kx, ky, rx);
      g.addColorStop(0, 'rgba(70,42,22,.55)'); g.addColorStop(0.5, 'rgba(90,58,30,.22)'); g.addColorStop(1, 'rgba(90,58,30,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(kx, ky, rx * 2.2, ry * 2, 0, 0, 7); x.fill();
    }
    return tex(c);
  }

  // 木饰面：vertical=true 时纹理竖向（门板、柜门）
  function wood(base, vertical, contrast = 1) {
    const S = 512, [c, x] = cv(S), img = x.createImageData(S, S), d = img.data;
    const st = vertical ? fbm(S, S, 22, 2, 4, 0.55) : fbm(S, S, 2, 22, 4, 0.55);
    const fn = vertical ? fbm(S, S, 96, 12, 2, 0.5) : fbm(S, S, 12, 96, 2, 0.5);
    for (let i = 0; i < S * S; i++) {
      const ring = 0.5 + 0.5 * Math.sin(st[i] * 12 * 6.2832);
      const v = ((ring - 0.5) * 22 + (fn[i] - 0.5) * 14 + (rnd() - 0.5) * 4) * contrast;
      d[i * 4] = cl(base[0] + v); d[i * 4 + 1] = cl(base[1] + v * 0.82); d[i * 4 + 2] = cl(base[2] + v * 0.6); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return tex(c);
  }

  // 艺术涂料 / 肌理硅藻泥：低频云纹 + 中尺度抹刀棱 + 细砂 + 同向批刮纹
  function plaster(base, amp = 7, strokes = 46) {
    const S = 512, [c, x] = cv(S), img = x.createImageData(S, S), d = img.data;
    const lo = fbm(S, S, 3, 3, 5, 0.55), ridge = fbm(S, S, 18, 18, 3, 0.55), hi = fbm(S, S, 64, 64, 2, 0.5);
    for (let i = 0; i < S * S; i++) {
      const v = (lo[i] - 0.5) * amp * 2.2 + (ridge[i] - 0.5) * 9 + (hi[i] - 0.5) * 7 + (rnd() - 0.5) * 6;
      d[i * 4] = cl(base[0] + v); d[i * 4 + 1] = cl(base[1] + v * 0.96); d[i * 4 + 2] = cl(base[2] + v * 0.9); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.lineCap = 'round';
    // 大面积抹刀云纹
    for (let k = 0; k < strokes; k++) {
      const cx = R(0, S), cy = R(0, S), r = R(30, 110), a0 = R(0, 6.28);
      x.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(80,50,30,0.022)';
      x.lineWidth = R(6, 20);
      x.beginPath(); x.arc(cx, cy, r, a0, a0 + R(0.4, 1.1)); x.stroke();
    }
    // 同向批刮短棱（艺术涂料手感，统一 24° 斜向）
    x.save(); x.translate(S / 2, S / 2); x.rotate(0.42);
    for (let k = 0; k < 240; k++) {
      x.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.028)' : 'rgba(70,45,28,0.02)';
      x.lineWidth = R(1, 3.2);
      const sx = R(-S * 0.7, S * 0.7), sy = R(-S * 0.7, S * 0.7);
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + R(18, 64), sy + R(-2, 2)); x.stroke();
    }
    x.restore();
    return tex(c);
  }

  // 莱姆石：60×120 大板，细缝、毛孔、化石斑
  function limestone(base) {
    const S = 512, [c, x] = cv(S), img = x.createImageData(S, S), d = img.data;
    const lo = fbm(S, S, 4, 4, 5, 0.5), hi = fbm(S, S, 48, 48, 2, 0.5);
    for (let i = 0; i < S * S; i++) {
      const v = (lo[i] - 0.5) * 14 + (hi[i] - 0.5) * 6 + (rnd() - 0.5) * 4;
      d[i * 4] = cl(base[0] + v); d[i * 4 + 1] = cl(base[1] + v * 0.95); d[i * 4 + 2] = cl(base[2] + v * 0.88); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    for (let k = 0; k < 1100; k++) {
      x.fillStyle = `rgba(${base[0] - 70},${base[1] - 75},${base[2] - 80},${R(0.12, 0.4)})`;
      x.beginPath(); x.arc(R(0, S), R(0, S), R(0.4, 1.5), 0, 7); x.fill();
    }
    for (let k = 0; k < 14; k++) {
      x.strokeStyle = `rgba(255,255,255,${R(0.08, 0.18)})`; x.lineWidth = R(1, 2.5);
      const sx = R(0, S), sy = R(0, S); x.beginPath(); x.moveTo(sx, sy);
      x.quadraticCurveTo(sx + R(-20, 20), sy + R(-20, 20), sx + R(-35, 35), sy + R(-35, 35)); x.stroke();
    }
    x.fillStyle = `rgba(${base[0] - 40},${base[1] - 42},${base[2] - 45},0.55)`;
    x.fillRect(0, 0, S, 1.5); x.fillRect(0, 0, 1.5, S); x.fillRect(S / 2, 0, 1.5, S);
    return tex(c);
  }

  // 大板瓷砖（厨房墙地）
  function tileStone(base, nx, ny, grout) {
    const S = 512, [c, x] = cv(S), img = x.createImageData(S, S), d = img.data;
    const lo = fbm(S, S, 4, 4, 4, 0.5);
    const tw = S / nx, th = S / ny, tones = [];
    for (let i = 0; i < nx * ny; i++) tones.push(R(-6, 6));
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const i = y * S + xx, tx = (xx / tw) | 0, ty = (y / th) | 0;
      const gx = xx - tx * tw, gy = y - ty * th;
      const g = (gx < 2 || gy < 2) ? grout : 0;
      const v = tones[ty * nx + tx] + (lo[i] - 0.5) * 10 + (rnd() - 0.5) * 3 - g;
      d[i * 4] = cl(base[0] + v); d[i * 4 + 1] = cl(base[1] + v); d[i * 4 + 2] = cl(base[2] + v * 0.96); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return tex(c);
  }

  // 织物：boucle 毛圈 / linen 亚麻
  function fabric(base, kind) {
    const S = 256, [c, x] = cv(S), img = x.createImageData(S, S), d = img.data;
    const n1 = fbm(S, S, 32, 32, 3, 0.55), n2 = fbm(S, S, 4, 64, 2, 0.5);
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const i = y * S + xx;
      let v;
      if (kind === 'boucle') v = (n1[i] - 0.5) * 46 + (rnd() - 0.5) * 10;
      else v = Math.sin(xx * 2.1) * 5 + Math.sin(y * 2.4) * 5 + (n2[i] - 0.5) * 22 + (rnd() - 0.5) * 8;
      d[i * 4] = cl(base[0] + v); d[i * 4 + 1] = cl(base[1] + v); d[i * 4 + 2] = cl(base[2] + v * 0.95); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return tex(c);
  }

  // 黄麻地毯：辫编纹 + 深色包边（按 UV 整张铺）
  function juteRug(base, border) {
    const S = 512, [c, x] = cv(S), img = x.createImageData(S, S), d = img.data;
    const n = fbm(S, S, 16, 16, 3, 0.5);
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const i = y * S + xx, band = (y / 9) | 0;
      const braid = Math.sin(((xx + (band % 2) * 5) / 5) * Math.PI) * 0.5 + 0.5;
      let v = (braid - 0.5) * 30 + (n[i] - 0.5) * 22 + (rnd() - 0.5) * 10 - ((y % 9) < 1.2 ? 22 : 0);
      const u = xx / S, w = y / S, edge = Math.min(u, 1 - u, w, 1 - w);
      if (border && edge < 0.035) v -= 34;
      d[i * 4] = cl(base[0] + v); d[i * 4 + 1] = cl(base[1] + v * 0.92); d[i * 4 + 2] = cl(base[2] + v * 0.78); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return tex(c);
  }

  // 藤编（八角孔，透明通道）
  function cane() {
    const S = 256, [c, x] = cv(S);
    x.clearRect(0, 0, S, S);
    const step = 16;
    x.lineCap = 'round';
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      for (let k = -S; k < 2 * S; k += step) {
        x.strokeStyle = 'rgb(176,134,84)'; x.lineWidth = 4.2;
        x.beginPath();
        if (dx && !dy) { x.moveTo(0, k + 8); x.lineTo(S, k + 8); }
        else if (!dx) { x.moveTo(k + 8, 0); x.lineTo(k + 8, S); }
        else if (dy > 0) { x.moveTo(k, 0); x.lineTo(k + S, S); }
        else { x.moveTo(k, S); x.lineTo(k + S, 0); }
        x.stroke();
        x.strokeStyle = 'rgba(232,196,140,0.75)'; x.lineWidth = 1.4; x.stroke();
      }
    }
    return tex(c);
  }

  function lanternPaper() {
    const S = 256, [c, x] = cv(S);
    x.fillStyle = '#f6efe2'; x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 9) { x.fillStyle = 'rgba(160,140,110,0.32)'; x.fillRect(0, y, S, 1.6); }
    for (let k = 0; k < 400; k++) { x.fillStyle = `rgba(200,180,150,${R(0.04, 0.1)})`; x.fillRect(R(0, S), R(0, S), R(2, 10), 1); }
    return tex(c);
  }

  // ---- 画作（按参考图风格手绘）
  function artAbstract() {
    const [c, x] = cv(512, 300);
    const g = x.createLinearGradient(0, 0, 512, 300); g.addColorStop(0, '#a2aaad'); g.addColorStop(1, '#bfbdb4');
    x.fillStyle = g; x.fillRect(0, 0, 512, 300);
    x.fillStyle = '#d9cbb6'; x.beginPath(); x.moveTo(60, 300); x.bezierCurveTo(80, 160, 220, 120, 250, 300); x.fill();
    x.fillStyle = '#7d6a5c'; x.beginPath(); x.moveTo(190, 70); x.bezierCurveTo(330, 40, 360, 170, 300, 220); x.bezierCurveTo(250, 250, 210, 170, 190, 70); x.fill();
    x.fillStyle = '#9b8576'; x.beginPath(); x.moveTo(300, 300); x.bezierCurveTo(330, 200, 450, 180, 470, 300); x.fill();
    x.fillStyle = '#e6dccd'; x.beginPath(); x.arc(400, 95, 46, 0, 7); x.fill();
    x.fillStyle = '#2e2926'; x.beginPath(); x.arc(118, 222, 14, 0, 7); x.fill();
    for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(255,255,255,${R(0, 0.05)})`; x.fillRect(R(0, 512), R(0, 300), 1, 1); }
    return tex(c);
  }
  function artPine(flip) {
    const [c, x] = cv(300, 420);
    x.fillStyle = '#d8cbaf'; x.fillRect(0, 0, 300, 420);
    for (let k = 0; k < 3000; k++) { x.fillStyle = `rgba(120,95,60,${R(0, 0.06)})`; x.fillRect(R(0, 300), R(0, 420), 1, 1); }
    x.save(); if (flip) { x.translate(300, 0); x.scale(-1, 1); }
    x.strokeStyle = 'rgba(40,36,32,0.85)'; x.lineCap = 'round';
    x.lineWidth = 7; x.beginPath(); x.moveTo(150, 410); x.bezierCurveTo(120, 300, 190, 230, 150, 120); x.stroke();
    x.lineWidth = 3; [[150, 190, 70, 170], [158, 240, 250, 210], [148, 150, 230, 120], [152, 280, 60, 260]].forEach(([a, b, cc, dd]) => { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo((a + cc) / 2, b - 20, cc, dd); x.stroke(); });
    [[70, 165], [245, 205], [228, 115], [62, 255], [150, 110], [110, 140], [200, 160]].forEach(([px, py]) => {
      for (let k = 0; k < 60; k++) { const a = R(-3.0, -0.1), l = R(10, 26); x.lineWidth = R(0.6, 1.6); x.strokeStyle = `rgba(30,32,28,${R(0.4, 0.85)})`; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l * 1.6, py + Math.sin(a) * l * 0.55); x.stroke(); }
    });
    x.restore();
    x.fillStyle = '#a3362a'; x.fillRect(flip ? 40 : 240, 360, 16, 16);
    return tex(c);
  }
  function artBotanical() {
    const [c, x] = cv(300, 380);
    x.fillStyle = '#f1ebdf'; x.fillRect(0, 0, 300, 380);
    x.strokeStyle = 'rgba(70,80,60,0.85)'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(150, 340); x.bezierCurveTo(140, 250, 170, 170, 150, 70); x.stroke();
    for (let k = 0; k < 12; k++) {
      const t = k / 12, py = 330 - t * 250, px = 150 + Math.sin(t * 6) * 8, s = k % 2 ? 1 : -1, l = 50 - t * 22;
      x.fillStyle = `rgba(${110 + k * 3},${132 + k * 2},${100},0.55)`;
      x.beginPath(); x.ellipse(px + s * l * 0.55, py - 8, l * 0.55, l * 0.2, s * -0.5, 0, 7); x.fill(); x.stroke();
    }
    x.fillStyle = 'rgba(60,60,55,0.7)'; x.font = '12px serif'; x.fillText('Ficus  ·  2026', 108, 365);
    return tex(c);
  }

  // ---- 天空穹顶（与太阳方向对齐）
  function sky(mode, sunDir) {
    const W = 2048, H = 1024, hz = H / 2, [c, x] = cv(W, H);
    const P = {
      day: { top: '#6f9fd0', mid: '#b4cee4', hor: '#e2eaee', gnd: '#557048', far: ['#9fb2b6', '#7f9a7c', '#5b7d55'], city: '#c3c9cc', haze: 'rgba(230,236,238,0.35)' },
      dusk: { top: '#7f9cc0', mid: '#e8bf9c', hor: '#ffcf96', gnd: '#4f5a3c', far: ['#a99a8a', '#7c8668', '#55654a'], city: '#a39484', haze: 'rgba(255,206,160,0.32)' },
      night: { top: '#070d1b', mid: '#101b33', hor: '#22304c', gnd: '#141820', far: ['#1b2436', '#151c2a', '#10151f'], city: '#1c2230', haze: 'rgba(40,52,80,0.4)' }
    }[mode];
    let g = x.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, P.top); g.addColorStop(0.62, P.mid); g.addColorStop(1, P.hor);
    x.fillStyle = g; x.fillRect(0, 0, W, hz + 2);
    g = x.createLinearGradient(0, hz, 0, H); g.addColorStop(0, P.hor); g.addColorStop(0.08, P.gnd); g.addColorStop(1, P.gnd);
    x.fillStyle = g; x.fillRect(0, hz, W, hz);
    const su = ((Math.atan2(sunDir.z, -sunDir.x) / (2 * Math.PI)) % 1 + 1) % 1;
    const sv = (Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, sunDir.y)))) / Math.PI;
    if (mode !== 'night') {
      [-W, 0, W].forEach(o => {
        const gx = su * W + o, gy = sv * H;
        const rg = x.createRadialGradient(gx, gy, 2, gx, gy, mode === 'dusk' ? 520 : 300);
        rg.addColorStop(0, mode === 'dusk' ? 'rgba(255,240,205,1)' : 'rgba(255,255,245,0.95)');
        rg.addColorStop(0.08, mode === 'dusk' ? 'rgba(255,205,140,0.75)' : 'rgba(255,250,235,0.45)');
        rg.addColorStop(1, 'rgba(255,200,150,0)');
        x.fillStyle = rg; x.fillRect(0, 0, W, H);
      });
      for (let k = 0; k < 46; k++) {
        const cx = R(0, W), cy = R(hz * 0.25, hz * 0.85), rw = R(60, 220);
        for (let q = 0; q < 6; q++) {
          const ex = cx + R(-rw, rw) * 0.6, ey = cy + R(-12, 12), er = R(rw * 0.25, rw * 0.55);
          const cg = x.createRadialGradient(ex, ey, 0, ex, ey, er);
          cg.addColorStop(0, mode === 'dusk' ? 'rgba(255,226,200,0.32)' : 'rgba(255,255,255,0.38)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = cg; x.beginPath(); x.ellipse(ex, ey, er * 1.8, er * 0.45, 0, 0, 7); x.fill();
        }
      }
    } else {
      for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(255,255,255,${R(0.2, 0.9)})`; x.fillRect(R(0, W), R(0, hz * 0.85), R(0.6, 1.8), R(0.6, 1.8)); }
      const mx = W * 0.62, my = hz * 0.35, mg = x.createRadialGradient(mx, my, 6, mx, my, 120);
      mg.addColorStop(0, 'rgba(255,248,225,1)'); mg.addColorStop(0.12, 'rgba(255,248,225,0.25)'); mg.addColorStop(1, 'rgba(255,248,225,0)');
      x.fillStyle = mg; x.fillRect(mx - 130, my - 130, 260, 260);
    }
    // 远山 3 层（可平铺）
    const ridge = fbm(W, 1, 6, 1, 4, 0.55), ridge2 = fbm(W, 1, 11, 1, 3, 0.5), ridge3 = fbm(W, 1, 19, 1, 3, 0.5);
    [[ridge, 110, 60, P.far[0]], [ridge2, 66, 40, P.far[1]], [ridge3, 34, 26, P.far[2]]].forEach(([rd, base, amp, col]) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, hz + 4);
      for (let xx = 0; xx <= W; xx += 4) x.lineTo(xx, hz - base * 0.5 - (rd[xx % W] - 0.3) * amp * 2.2);
      x.lineTo(W, hz + 4); x.fill();
      x.fillStyle = P.haze; x.fillRect(0, hz - base - amp, W, base + amp + 4);
    });
    // 城市 + 林带（地平线以下，高层视角）
    for (let k = 0; k < 140; k++) {
      const bx = R(0, W), bw = R(10, 30), bh = R(4, 26), by = hz + R(14, 26);
      x.fillStyle = P.city; x.fillRect(bx, by - bh, bw, bh);
      if (mode === 'night') for (let q = 0; q < bw * bh / 70; q++) { x.fillStyle = `rgba(255,${R(200, 230)},${R(140, 180)},${R(0.35, 0.8)})`; x.fillRect(bx + R(1, bw - 2), by - R(1, bh - 1), 1, 1); }
    }
    [['#0d120e', '#56603f', '#557a46', 18, 38], ['#0a0e0b', '#424d32', '#3f6236', 34, 60]].forEach(([cn, cd, cy, y0, hmax]) => {
      x.fillStyle = mode === 'night' ? cn : mode === 'dusk' ? cd : cy;
      for (let xx = 0; xx < W; xx += 5) { const hh = R(hmax * 0.35, hmax); x.beginPath(); x.ellipse(xx + R(-3, 3), hz + y0 + 10, R(5, 12), hh, 0, 0, 7); x.fill(); }
      x.fillRect(0, hz + y0 + 10, W, hz);
    });
    if (mode === 'night') for (let k = 0; k < 260; k++) { x.fillStyle = `rgba(255,${R(180, 220)},${R(120, 160)},${R(0.25, 0.7)})`; x.fillRect(R(0, W), hz + R(30, 160), 1, 1); }
    const t = tex(c); t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
    return t;
  }

  // 柔光渐变：接触阴影（圆角矩形） / 线性衰减条
  function blob() {
    const S = 128, [c, x] = cv(S), img = x.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const u = Math.abs(xx / (S - 1) * 2 - 1), v = Math.abs(y / (S - 1) * 2 - 1);
      const q = Math.max(0, Math.hypot(Math.max(0, u - 0.55), Math.max(0, v - 0.55)) / 0.45);
      const a = Math.max(0, 1 - q); const i = (y * S + xx) * 4;
      d[i] = d[i + 1] = d[i + 2] = cl(255 * a * a); d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0); const t = tex(c, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }
  function fade(power = 1.6) {
    const W = 16, Hh = 512, [c, x] = cv(W, Hh), img = x.createImageData(W, Hh), d = img.data;
    for (let y = 0; y < Hh; y++) for (let xx = 0; xx < W; xx++) {
      const a = Math.pow(1 - y / (Hh - 1), power), i = (y * W + xx) * 4; d[i] = d[i + 1] = d[i + 2] = cl(255 * a + (rnd() - 0.5) * 2); d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0); const t = tex(c, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 1; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
  }
  function ring() {
    const S = 256, [c, x] = cv(S), g = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.18, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S); const t = tex(c, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }

  // ---------------------------------------------------------------- 世界投影 + 微凹凸
  function tri(m, sx, sy, bump, opt = {}) {
    m.userData.tri = new THREE.Vector2(1 / sx, 1 / (sy || sx));
    m.userData.bump = bump || 0;
    m.defines = Object.assign({}, m.defines);
    if (bump) m.defines.TRI_BUMP = '';
    if (opt.cap) { m.defines.TRI_CAP = ''; m.side = THREE.DoubleSide; m.shadowSide = THREE.BackSide; m.userData.cap = new THREE.Color(opt.cap); }
    if (opt.map2) { m.defines.TRI_SPLIT = ''; m.userData.map2 = opt.map2; m.userData.tri2 = new THREE.Vector2(1 / opt.s2, 1 / opt.s2); m.userData.split = opt.split; }
    m.onBeforeCompile = sh => {
      sh.uniforms.uTri = { value: m.userData.tri };
      sh.uniforms.uBump = { value: m.userData.bump };
      sh.uniforms.uCap = { value: m.userData.cap || new THREE.Color(0x3a332e) };
      sh.uniforms.uMap2 = { value: m.userData.map2 || null };
      sh.uniforms.uTri2 = { value: m.userData.tri2 || new THREE.Vector2(1, 1) };
      sh.uniforms.uSplitY = { value: m.userData.split || 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTriP;\nvarying vec3 vTriN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriP = (modelMatrix * vec4(position, 1.0)).xyz;\nvTriN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vTriP; varying vec3 vTriN;
uniform vec2 uTri; uniform float uBump; uniform vec3 uCap; uniform sampler2D uMap2; uniform vec2 uTri2; uniform float uSplitY;
vec2 triDH = vec2(0.0);
float triLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 triPerturb(vec3 sp, vec3 sn, vec2 dh, float fd) {
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  vec3 gr = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * sn - gr);
}`)
        .replace('#include <map_fragment>', `
#ifdef USE_MAP
{
  vec3 tn = abs(vTriN);
  vec2 tp = (tn.y > tn.x && tn.y > tn.z) ? vTriP.xz : ((tn.x > tn.z) ? vTriP.zy : vTriP.xy);
  vec2 st = tp * uTri;
  vec2 ddx = dFdx(st), ddy = dFdy(st);
  vec4 tc = texture2D(map, st);
  #ifdef TRI_BUMP
  float h0 = triLum(tc.rgb);
  triDH = uBump * vec2(triLum(texture2D(map, st + ddx).rgb) - h0, triLum(texture2D(map, st + ddy).rgb) - h0);
  #endif
  #ifdef TRI_SPLIT
  if (vTriP.y > uSplitY) tc = texture2D(uMap2, tp * uTri2);
  #endif
  diffuseColor *= tc;
}
#endif`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef TRI_BUMP
normal = triPerturb(-vViewPosition, normal, triDH, faceDirection);
#endif`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
#ifdef TRI_CAP
if (!gl_FrontFacing) gl_FragColor = vec4(uCap, 1.0);
#endif`);
    };
    m.customProgramCacheKey = () => 'tri';
    return m;
  }

  // ---------------------------------------------------------------- 材质表
  const emissives = [];   // {m, day, dusk, night}
  function std(color, rough, o = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: rough, metalness: 0 }, o));
    m.userData.env = o.envMapIntensity != null ? o.envMapIntensity : 0.55;
    m.envMapIntensity = m.userData.env;
    return m;
  }
  function emit(m, day, dusk, night) { emissives.push({ m, day, dusk, night }); return m; }

  function build() {
    const T = {
      floorLiving: floorOak([164, 110, 66]), floorKeep: floorOak([198, 160, 118]),
      oakHoney: wood([186, 138, 92], false), oakLight: wood([206, 172, 130], false), oakPale: wood([214, 186, 148], true, 0.7),
      doorOak: wood([196, 156, 112], true, 0.6), walnut: wood([112, 76, 52], false), walnutV: wood([104, 70, 48], true),
      kitchenWood: wood([108, 80, 60], true, 0.45), ash: wood([222, 200, 168], false, 0.6),
      terra: plaster([230, 188, 152], 9), warm: plaster([236, 226, 210], 6), keep: plaster([236, 231, 223], 5),
      blush: plaster([214, 160, 146], 6), ceil: plaster([246, 243, 237], 2, 0), ext: plaster([214, 209, 201], 6),
      lime: limestone([238, 229, 214]), limeBlush: limestone([232, 200, 186]),
      kWall: tileStone([214, 208, 199], 4, 2, 18), kFloor: tileStone([176, 171, 164], 3, 3, 22), balc: tileStone([206, 190, 172], 4, 4, 20),
      boucle: fabric([226, 216, 200], 'boucle'), boucleCream: fabric([238, 232, 222], 'boucle'),
      linenOat: fabric([214, 200, 178], 'linen'), linenSand: fabric([200, 180, 152], 'linen'), linenWhite: fabric([242, 238, 230], 'linen'),
      linenTaupe: fabric([150, 134, 118], 'linen'), linenSage: fabric([160, 168, 146], 'linen'), linenGrey: fabric([170, 168, 162], 'linen'),
      linenRust: fabric([176, 120, 92], 'linen'), mesh: fabric([60, 60, 62], 'linen'), sageMat: fabric([138, 158, 126], 'boucle'),
      rug: juteRug([200, 178, 140], true), rug2: juteRug([186, 162, 126], true), cane: cane(), paper: lanternPaper(),
      artA: artAbstract(), artP1: artPine(false), artP2: artPine(true), artB: artBotanical(),
      blob: blob(), fade: fade(1.7), fadeSoft: fade(2.6), ring: ring()
    };
    T.cane.repeat.set(2.2, 2.2);
    const triM = (color, rough, t, s, bump, o = {}, opt) => { const m = std(color, rough, o); m.map = t; return tri(m, s[0], s[1], bump, opt); };
    const CAP = { cap: 0x3b3430 };

    const M = {
      // 建筑面
      floor_living: triM(0xffffff, 0.5, T.floorLiving, [2.4, 1.2], 0.004, { envMapIntensity: 0.6 }),
      floor_keep: triM(0xffffff, 0.52, T.floorKeep, [2.4, 1.2], 0.004, { envMapIntensity: 0.6 }),
      plaster_terra: triM(0xffffff, 0.95, T.terra, [1.25, 1.25], 0.026, { envMapIntensity: 0.4 }, CAP),
      plaster_warm: triM(0xffffff, 0.95, T.warm, [1.25, 1.25], 0.022, { envMapIntensity: 0.4 }, CAP),
      plaster_keep: triM(0xffffff, 0.93, T.keep, [1.25, 1.25], 0.016, { envMapIntensity: 0.4 }, CAP),
      exterior: triM(0xffffff, 0.92, T.ext, [2, 2], 0.01, { envMapIntensity: 0.3 }, CAP),
      ceiling: emit(triM(0xfff4ea, 0.96, T.ceil, [2, 2], 0.004, { envMapIntensity: 0.3, side: THREE.DoubleSide, emissive: 0xffc890 }), 0.0, 0.07, 0.05),
      tile_kwall: triM(0xffffff, 0.45, T.kWall, [2.4, 2.4], 0.003, { envMapIntensity: 0.6 }, CAP),
      tile_kfloor: triM(0xffffff, 0.5, T.kFloor, [2.4, 2.4], 0.003),
      tile_balcony: triM(0xffffff, 0.7, T.balc, [3.2, 3.2], 0.004),
      lime_floor: triM(0xffffff, 0.6, T.lime, [1.2, 1.2], 0.004),
      bath_mb: triM(0xffffff, 0.7, T.lime, [1.2, 1.2], 0.004, { envMapIntensity: 0.45 }, Object.assign({ map2: T.blush, s2: 1.6, split: 1.2 }, CAP)),
      bath_gb: triM(0xffffff, 0.66, T.lime, [1.2, 1.2], 0.004, { envMapIntensity: 0.45 }, CAP),
      bath_blush: triM(0xffffff, 0.66, T.limeBlush, [1.2, 1.2], 0.004, { envMapIntensity: 0.45 }, CAP),
      baseboard: std(0xebe4d9, 0.6),
      // 木作
      oak_honey: triM(0xffffff, 0.5, T.oakHoney, [1, 1], 0.003),
      oak_light: triM(0xffffff, 0.52, T.oakLight, [1, 1], 0.003),
      oak_pale: triM(0xffffff, 0.55, T.oakPale, [0.9, 2.2], 0.002),
      door_oak: triM(0xffffff, 0.5, T.doorOak, [0.9, 2.2], 0.002),
      walnut: triM(0xffffff, 0.45, T.walnut, [1, 1], 0.003),
      walnut_v: triM(0xffffff, 0.45, T.walnutV, [1, 1], 0.003),
      wood_kitchen: triM(0xffffff, 0.5, T.kitchenWood, [0.9, 2.4], 0.002),
      ash: triM(0xffffff, 0.55, T.ash, [1, 1], 0.003),
      bentwood: triM(0xd8b48a, 0.45, T.oakHoney, [0.6, 0.6], 0.002),
      plinth_dark: std(0x2c2724, 0.8),
      // 织物
      boucle_oat: triM(0xffffff, 1, T.boucle, [0.22, 0.22], 0.02, { envMapIntensity: 0.25 }),
      boucle_cream: triM(0xffffff, 1, T.boucleCream, [0.22, 0.22], 0.02, { envMapIntensity: 0.25 }),
      linen_oat: triM(0xffffff, 0.98, T.linenOat, [0.18, 0.18], 0.012, { envMapIntensity: 0.25 }),
      linen_sand: triM(0xffffff, 0.98, T.linenSand, [0.18, 0.18], 0.012, { envMapIntensity: 0.25 }),
      linen_white: triM(0xffffff, 0.96, T.linenWhite, [0.18, 0.18], 0.01, { envMapIntensity: 0.3 }),
      linen_taupe: triM(0xffffff, 0.98, T.linenTaupe, [0.18, 0.18], 0.012, { envMapIntensity: 0.25 }),
      linen_sage: triM(0xffffff, 0.98, T.linenSage, [0.18, 0.18], 0.012, { envMapIntensity: 0.25 }),
      linen_grey: triM(0xffffff, 0.98, T.linenGrey, [0.18, 0.18], 0.012, { envMapIntensity: 0.25 }),
      linen_rust: triM(0xffffff, 0.98, T.linenRust, [0.18, 0.18], 0.012, { envMapIntensity: 0.25 }),
      mesh_dark: triM(0xffffff, 0.9, T.mesh, [0.1, 0.1], 0.01),
      mat_sage: triM(0xffffff, 0.9, T.sageMat, [0.3, 0.3], 0.01),
      drape: (() => { const m = std(0xffffff, 1, { side: THREE.DoubleSide, envMapIntensity: 0.25 }); m.map = T.linenOat; return tri(m, 0.18, 0.18, 0.01); })(),
      drape_taupe: (() => { const m = std(0xffffff, 1, { side: THREE.DoubleSide, envMapIntensity: 0.25 }); m.map = T.linenTaupe; return tri(m, 0.18, 0.18, 0.01); })(),
      sheer: std(0xf7f1e7, 1, { transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.2 }),
      rug_jute: (() => { const m = std(0xffffff, 1, { envMapIntensity: 0.2 }); m.map = T.rug; return m; })(),
      rug_jute2: (() => { const m = std(0xffffff, 1, { envMapIntensity: 0.2 }); m.map = T.rug2; return m; })(),
      cane: (() => { const m = std(0xffffff, 0.8, { side: THREE.DoubleSide, alphaTest: 0.5 }); m.map = T.cane; return m; })(),
      // 石材 / 陶瓷 / 金属 / 玻璃
      stone_counter: std(0xe9e4dc, 0.35, { envMapIntensity: 0.8 }),
      ceramic_white: std(0xf3f1ed, 0.18, { envMapIntensity: 0.9 }),
      ceramic: std(0xe6dfd3, 0.45, { envMapIntensity: 0.6 }),
      ceramic_sand: std(0xc9b49a, 0.6),
      ceramic_clay: std(0xa9805f, 0.75),
      ceramic_dark: std(0x4a4440, 0.5),
      ceramic_sage: std(0x96a08c, 0.55),
      terracotta: std(0xb07a58, 0.85),
      stone_grey: std(0x9b958d, 0.8),
      iron: std(0x2b2a29, 0.55, { metalness: 0.6 }),
      black_metal: std(0x1e1f21, 0.45, { metalness: 0.6, envMapIntensity: 0.8 }),
      alu_dark: std(0x2f3133, 0.42, { metalness: 0.7, envMapIntensity: 0.8 }),
      brass: std(0xc29a5b, 0.32, { metalness: 1, envMapIntensity: 1.1 }),
      steel: std(0xc9c9cc, 0.25, { metalness: 1, envMapIntensity: 1.1 }),
      chrome: std(0xe8e8ea, 0.08, { metalness: 1, envMapIntensity: 1.2 }),
      sink_black: std(0x222222, 0.5, { envMapIntensity: 0.6 }),
      fridge_black: std(0x1f2124, 0.22, { metalness: 0.4, envMapIntensity: 1.0 }),
      glass_black: std(0x101113, 0.08, { metalness: 0.2, envMapIntensity: 1.2 }),
      plastic_white: std(0xeeece8, 0.35),
      plastic_black: std(0x1d1d1f, 0.5),
      mirror: std(0xd8d4cc, 0.08, { metalness: 0.9, envMapIntensity: 1.6 }),
      glass: std(0xdfe9ec, 0.05, { transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2 }),
      glass_frost: std(0xf3f4f1, 0.5, { transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.6 }),
      glass_clear: std(0xf4f8f8, 0.04, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3 }),
      // 发光体（强度随时段切换）
      led: emit(std(0xfff1dc, 0.5, { emissive: 0xffc98e }), 0.15, 1.3, 2.2),
      lens: emit(std(0xfff6e8, 0.4, { emissive: 0xffdcae }), 0.1, 0.8, 1.6),
      lantern: emit((() => { const m = std(0xffffff, 0.9, { emissive: 0xffd9a8, side: THREE.DoubleSide }); m.map = T.paper; m.emissiveMap = T.paper; return m; })(), 0.12, 0.85, 1.4),
      shade: emit(std(0xf3ead8, 0.9, { emissive: 0xffd3a0, side: THREE.DoubleSide }), 0.05, 0.75, 1.3),
      bulb: emit(std(0xfff4e0, 0.3, { emissive: 0xffe2b8 }), 0.2, 1.6, 2.4),
      tv_art: emit((() => { const m = std(0xffffff, 0.75, { emissive: 0xffffff }); m.map = T.artA; m.emissiveMap = T.artA; return m; })(), 0.04, 0.1, 0.22),
      screen: emit(std(0x223040, 0.2, { emissive: 0x9cc0e8 }), 0.12, 0.25, 0.45),
      panel_glow: emit(std(0x111214, 0.2, { emissive: 0x6aa8ff }), 0.2, 0.4, 0.7),
      art_pine1: (() => { const m = std(0xffffff, 0.9); m.map = T.artP1; return m; })(),
      art_pine2: (() => { const m = std(0xffffff, 0.9); m.map = T.artP2; return m; })(),
      art_botanical: (() => { const m = std(0xffffff, 0.9); m.map = T.artB; return m; })(),
      paper_white: std(0xf4f1ea, 0.9),
      // 植物
      leaf: std(0x4f7a3d, 0.55, { side: THREE.DoubleSide, envMapIntensity: 0.35 }),
      leaf_olive: std(0x7d8f66, 0.6, { side: THREE.DoubleSide, envMapIntensity: 0.3 }),
      leaf_grass: std(0xb9a77a, 0.8, { side: THREE.DoubleSide, envMapIntensity: 0.2 }),
      leaf_dry: std(0xa88f6a, 0.85, { side: THREE.DoubleSide }),
      bark: std(0x6a5440, 0.9),
      soil: std(0x3d3227, 1)
    };
    // 建筑专用（俯瞰剖切时只裁这些，家具保持完整）
    Object.assign(M, {
      door_frame: triM(0xffffff, 0.5, T.doorOak, [0.9, 2.2], 0.002),
      door_leaf: triM(0xffffff, 0.48, T.doorOak, [0.9, 2.2], 0.002),
      walnut_door: triM(0xffffff, 0.45, T.walnutV, [1, 1], 0.003),
      walnut_frame: triM(0xffffff, 0.45, T.walnutV, [1, 1], 0.003),
      alu_win: std(0x2c2e30, 0.4, { metalness: 0.6, envMapIntensity: 0.8 }),
      fixture: std(0x1e1f21, 0.45, { metalness: 0.6, envMapIntensity: 0.8 }),
      wallcap: std(0x4b423c, 0.95),
      stone_sill: std(0xebe6de, 0.35, { envMapIntensity: 0.8 }),
      glass_win: std(0xe2ecef, 0.04, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.1 }),
      glass_bath: std(0xf2f3ef, 0.5, { transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.6 }),
      glass_shower: std(0xf6f9f9, 0.03, { transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3 }),
      drape_grey: (() => { const m = std(0xffffff, 1, { side: THREE.DoubleSide, envMapIntensity: 0.25 }); m.map = T.linenGrey; return tri(m, 0.18, 0.18, 0.01); })()
    });
    M.books = [0xb9a68c, 0x7d6b5a, 0xd8cfc0, 0x8e9a86, 0x9b6f58, 0x3f4a52, 0xc7b9a2, 0xe6dfd2, 0x6f7b6a].map(c => std(c, 0.8, { envMapIntensity: 0.35 }));
    M.inv = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    // 叠加层（加色洗墙光 / 接触阴影）
    M.wash = new THREE.MeshBasicMaterial({ color: 0xffc58a, alphaMap: T.fade, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    M.wash_cool = M.wash.clone(); M.wash_cool.color.set(0xffd9b0);
    M.ceilglow = new THREE.MeshBasicMaterial({ color: 0xffc58a, alphaMap: T.fadeSoft, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    M.halo = new THREE.MeshBasicMaterial({ color: 0xffd6a6, alphaMap: T.ring, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const shadowCache = {};
    M.contact = op => {
      const k = Math.round(op * 20);
      return shadowCache[k] || (shadowCache[k] = new THREE.MeshBasicMaterial({ color: 0x1a1410, alphaMap: T.blob, transparent: true, opacity: k / 20, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    };
    M.ao = new THREE.MeshBasicMaterial({ color: 0x1c140e, alphaMap: T.fadeSoft, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    M.ao_ceil = M.ao.clone(); M.ao_ceil.opacity = 0.16;
    return { M, T, emissives, sky };
  }

  window.NATIVE_MATS = { build };
})();
