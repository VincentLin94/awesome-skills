/* 程序化植物：叶片为参数化曲面（可弯曲、可对折），全部合批进场景，零 glTF。
 * 用法：NATIVE_PLANTS.build(kind, frameMatrix, height_m, add, M, seed)
 * add(geom, mat, matrix, castShadow) 由 scene.js 提供，负责按材质合并几何体。
 */
(function () {
  let s = 7;
  const rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const RR = (a, b) => a + (b - a) * rng();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // 叶形轮廓：v∈[0,1] 从叶柄到叶尖，返回相对宽度
  const PROF = {
    fiddle: v => Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.03)), 0.5) * (0.42 + 0.78 * v) * (1 - 0.06 * Math.sin(v * 19)),
    oval: v => Math.pow(Math.sin(Math.PI * v), 0.72),
    lance: v => Math.pow(Math.sin(Math.PI * v), 0.95),
    blade: v => Math.max(0.02, 1 - v * 0.96),
    plume: v => Math.pow(Math.sin(Math.PI * v), 0.6)
  };
  const cache = {};
  // 单位叶片：长 1，宽 ratio；curl 叶尖下垂量，fold 沿主脉对折量
  function leaf(kind, ratio, curl, fold, nu, nv) {
    const key = [kind, ratio, curl, fold, nu, nv].join('|');
    if (cache[key]) return cache[key];
    const pos = [], uv = [], idx = [], prof = PROF[kind];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv, w = prof(v) * ratio;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu * 2 - 1;
        pos.push(u * w * 0.5, v, curl * v * v + fold * Math.abs(u) * w * 0.5);
        uv.push(i / nu, v);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return (cache[key] = g);
  }

  const _a = new THREE.Matrix4(), _b = new THREE.Matrix4();
  // 叶片姿态：基点 p，方位角 az，仰角 el，绕主脉扭转 roll，长 L，宽缩放 ws
  function orient(F, p, az, el, roll, L, ws) {
    const m = F.clone().multiply(_a.makeTranslation(p.x, p.y, p.z));
    m.multiply(_a.makeRotationY(az)).multiply(_a.makeRotationX(Math.PI / 2 - el))
      .multiply(_a.makeRotationY(Math.PI + roll)).multiply(_b.makeScale(L * ws, L, L));
    return m;
  }
  function tube(pts, r, seg = 16, rs = 6) {
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false);
  }
  function lathe(prof, seg = 28) { return new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg); }

  // 花盆：planter 收口圆台 / belly 鼓腹 / cylinder 直筒；返回盆口高度
  function pot(F, add, M, style, r, h, mat) {
    let prof;
    if (style === 'belly') prof = [[0, 0], [r * 0.55, 0], [r * 0.62, 0.01], [r, h * 0.48], [r * 0.82, h * 0.88], [r * 0.7, h], [r * 0.66, h * 0.97]];
    else if (style === 'cylinder') prof = [[0, 0], [r * 0.96, 0], [r, 0.01], [r, h], [r * 0.93, h], [r * 0.93, h * 0.94]];
    else prof = [[0, 0], [r * 0.72, 0], [r * 0.76, 0.012], [r, h], [r * 0.92, h], [r * 0.9, h * 0.95]];
    add(lathe(prof, 32), mat, F, true);
    const sr = style === 'belly' ? r * 0.68 : r * 0.9;
    const soil = new THREE.CircleGeometry(sr, 24).rotateX(-Math.PI / 2).translate(0, h * 0.93, 0);
    add(soil, M.soil, F, false);
    return h * 0.93;
  }

  function ficus(F, h, add, M) {
    const top = pot(F, add, M, 'planter', 0.2, 0.38, M.ceramic_sand);
    const k = h / 1.75;
    const trunk = [V(0, top - 0.05, 0), V(0.025, top + 0.3 * k, 0.01), V(-0.02, top + 0.62 * k, -0.015), V(0.015, h * 0.9, 0.01)];
    add(tube(trunk, 0.017, 18, 7), M.bark, F, true);
    const curve = new THREE.CatmullRomCurve3(trunk);
    const anchors = [];
    for (let b = 0; b < 3; b++) {
      const t = 0.55 + b * 0.13, p = curve.getPoint(t), az = b * 2.1 + 0.4, l = RR(0.22, 0.32) * k;
      const end = V(p.x + Math.sin(az) * l, p.y + l * 0.55, p.z + Math.cos(az) * l);
      add(tube([p, V((p.x + end.x) / 2, (p.y + end.y) / 2 - 0.02, (p.z + end.z) / 2), end], 0.009, 8, 5), M.bark, F, true);
      anchors.push([p, end]);
    }
    const g = leaf('fiddle', 0.8, 0.14, -0.1, 4, 7);
    for (let i = 0; i < 64; i++) {
      let p, up;
      if (i < 40) { const t = 0.32 + 0.68 * (i / 40); p = curve.getPoint(t); up = t; }
      else { const [a, e] = anchors[i % 3]; const t = RR(0.3, 1); p = a.clone().lerp(e, t); up = 0.8; }
      const az = i * 2.39996 + RR(-0.3, 0.3);
      const off = RR(0.02, 0.05);
      const base = V(p.x + Math.sin(az) * off, p.y + RR(-0.02, 0.03), p.z + Math.cos(az) * off);
      const el = RR(-0.15, 0.45) + up * 0.45;
      const L = RR(0.2, 0.3) * k * (1.05 - up * 0.25);
      add(g, rng() > 0.25 ? M.leaf : M.leaf_olive, orient(F, base, az, el, RR(-0.4, 0.4), L, RR(0.85, 1.1)), true);
    }
  }

  function olive(F, h, add, M) {
    const top = pot(F, add, M, 'planter', 0.2, 0.36, M.terracotta);
    const k = h / 1.6;
    const tr = [V(0, top - 0.04, 0), V(0.03, top + 0.25 * k, 0.02), V(-0.02, top + 0.48 * k, 0), V(0.01, top + 0.62 * k, -0.01)];
    add(tube(tr, 0.024, 14, 7), M.bark, F, true);
    const crownC = tr[3];
    const tips = [];
    for (let b = 0; b < 5; b++) {
      const az = b * 1.26 + RR(-0.3, 0.3), l = RR(0.25, 0.4) * k;
      const end = V(crownC.x + Math.sin(az) * l, crownC.y + RR(0.18, 0.42) * k, crownC.z + Math.cos(az) * l);
      add(tube([crownC, V((crownC.x + end.x) / 2, (crownC.y + end.y) / 2 + 0.02, (crownC.z + end.z) / 2), end], 0.011, 8, 5), M.bark, F, true);
      tips.push(end);
    }
    const g = leaf('lance', 0.2, 0.06, -0.05, 1, 3);
    for (let i = 0; i < 520; i++) {
      const c = tips[i % tips.length];
      const r = 0.22 * k * Math.cbrt(rng());
      const th = RR(0, Math.PI * 2), ph = Math.acos(RR(-0.6, 1));
      const p = V(c.x + r * Math.sin(ph) * Math.cos(th), c.y + r * Math.cos(ph) * 0.75, c.z + r * Math.sin(ph) * Math.sin(th));
      add(g, rng() > 0.4 ? M.leaf_olive : M.leaf, orient(F, p, RR(0, 6.28), RR(-0.5, 0.6), RR(-1, 1), RR(0.05, 0.075), 1), true);
    }
  }

  function grass(F, h, add, M) {
    const top = pot(F, add, M, 'cylinder', 0.17, 0.34, M.stone_grey);
    const g = leaf('blade', 0.035, 0.32, 0, 1, 6);
    for (let i = 0; i < 110; i++) {
      const az = RR(0, 6.28), rr = RR(0, 0.1);
      const p = V(Math.sin(az) * rr, top, Math.cos(az) * rr);
      add(g, rng() > 0.3 ? M.leaf_grass : M.leaf_olive, orient(F, p, az, RR(0.95, 1.45), RR(-0.5, 0.5), RR(0.45, 0.75) * h, 1), true);
    }
    const pl = leaf('plume', 0.16, 0.08, 0, 2, 5);
    for (let i = 0; i < 9; i++) {
      const az = RR(0, 6.28), lean = RR(0.05, 0.25), L = RR(0.75, 1.0) * h;
      const tip = V(Math.sin(az) * lean * L, top + L * Math.cos(lean), Math.cos(az) * lean * L);
      add(tube([V(0, top, 0), V(tip.x * 0.5, top + (tip.y - top) * 0.55, tip.z * 0.5), tip], 0.003, 6, 4), M.leaf_dry, F, true);
      for (let q = 0; q < 6; q++) add(pl, M.leaf_dry, orient(F, V(tip.x, tip.y - 0.02, tip.z), az + q * 1.05, RR(1.0, 1.35), 0, RR(0.16, 0.22) * h / 1.0, 1), false);
    }
  }

  function rubber(F, h, add, M, potMat) {
    const top = pot(F, add, M, 'belly', 0.16, 0.32, potMat || M.ceramic_white);
    const g = leaf('oval', 0.6, 0.08, -0.08, 3, 5);
    for (let st = 0; st < 3; st++) {
      const az = st * 2.1 + RR(-0.3, 0.3), lean = RR(0.08, 0.22), L = (h - top) * RR(0.8, 1);
      const tip = V(Math.sin(az) * lean * L, top + L, Math.cos(az) * lean * L);
      const pts = [V(0, top - 0.02, 0), V(tip.x * 0.4, top + L * 0.45, tip.z * 0.4), tip];
      add(tube(pts, 0.008, 10, 5), M.bark, F, true);
      const c = new THREE.CatmullRomCurve3(pts);
      for (let i = 0; i < 11; i++) {
        const t = 0.3 + 0.7 * i / 10, p = c.getPoint(t);
        add(g, M.leaf, orient(F, p, az + i * 2.4, RR(0.1, 0.6) + t * 0.3, RR(-0.3, 0.3), RR(0.13, 0.19) * (h / 0.9), 1), true);
      }
    }
  }

  function bush(F, h, add, M, potMat) {
    const top = pot(F, add, M, 'belly', h * 0.32, h * 0.42, potMat || M.ceramic);
    const g = leaf('oval', 0.7, 0.1, -0.1, 2, 4);
    for (let i = 0; i < 34; i++) {
      const az = i * 2.39996, el = RR(0.2, 1.2);
      add(g, rng() > 0.3 ? M.leaf : M.leaf_olive, orient(F, V(Math.sin(az) * 0.01, top, Math.cos(az) * 0.01), az, el, RR(-0.4, 0.4), RR(0.45, 0.7) * (h - top) + 0.02, 1), true);
    }
  }

  // 花瓶 + 枝条（干枝 / 尤加利）
  function twigs(F, h, add, M, vaseMat, leafy) {
    const vh = h * 0.36;
    add(lathe([[0, 0], [vh * 0.3, 0], [vh * 0.42, vh * 0.35], [vh * 0.36, vh * 0.75], [vh * 0.18, vh * 0.92], [vh * 0.2, vh], [vh * 0.17, vh * 0.98]], 28), vaseMat || M.ceramic_sand, F, true);
    const g = leaf('oval', 0.9, 0.02, 0, 1, 2);
    for (let b = 0; b < 6; b++) {
      const az = RR(0, 6.28), lean = RR(0.1, 0.42), L = RR(0.6, 1) * (h - vh);
      const tip = V(Math.sin(az) * lean * L, vh + L, Math.cos(az) * lean * L);
      const mid = V(tip.x * 0.45 + RR(-0.02, 0.02), vh + L * 0.5, tip.z * 0.45 + RR(-0.02, 0.02));
      add(tube([V(0, vh * 0.9, 0), mid, tip], 0.0025, 8, 4), M.bark, F, false);
      const c = new THREE.CatmullRomCurve3([V(0, vh, 0), mid, tip]);
      const n = leafy ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const p = c.getPoint(0.35 + 0.65 * i / n);
        add(g, leafy ? M.leaf_olive : M.leaf_dry, orient(F, p, RR(0, 6.28), RR(-0.3, 0.6), 0, RR(0.025, 0.04) * (leafy ? 1.2 : 0.8), 1), false);
      }
    }
  }

  function build(kind, F, h, add, M, sd, extra) {
    s = (sd || 7) >>> 0 || 7;
    if (kind === 'ficus') ficus(F, h, add, M);
    else if (kind === 'olive') olive(F, h, add, M);
    else if (kind === 'grass') grass(F, h, add, M);
    else if (kind === 'rubber') rubber(F, h, add, M, extra);
    else if (kind === 'bush') bush(F, h, add, M, extra);
    else if (kind === 'twigs') twigs(F, h, add, M, extra, false);
    else if (kind === 'eucalyptus') twigs(F, h, add, M, extra, true);
  }

  window.NATIVE_PLANTS = { build };
})();
