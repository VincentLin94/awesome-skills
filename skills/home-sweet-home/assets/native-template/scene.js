/* 场景装配：读 window.HOME（户型数据，cm）生成建筑 + 家具，全部原生 three.js。
 * 坐标：平面 cm（x 东、y 南、z 高）→ three 米 (x/100, z/100, y/100)。
 * 性能：同材质的静态几何体全部合并（add → flush），全屋约 120 个 draw call。
 */
(function () {
  const H = window.HOME;
  const WH = 280, CH = 275;               // 墙高 / 吊顶高（cm）
  let M, T, scene, root;
  const BATCH = new Map();                 // material -> {cast:[], nocast:[]}
  const DYN = { lights: [], washes: [], ceilGlows: [], halos: [], doors: [], ceilings: [], overlays: [], labels: [], bays: [] };
  const COLL = { segs: [], boxes: [] };    // 漫游碰撞：墙段（米）+ 家具 AABB（米）
  const rooms = {}; H.rooms.forEach(r => rooms[r.id] = r);

  const DEG = Math.PI / 180;
  const m4 = () => new THREE.Matrix4();
  const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

  // ---------------------------------------------------------------- 合批
  function add(geom, mat, matrix, cast = true) {
    if (!mat) return;
    let b = BATCH.get(mat); if (!b) BATCH.set(mat, b = { cast: [], nocast: [] });
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    (cast ? b.cast : b.nocast).push(g);
  }
  function flush() {
    for (const [mat, b] of BATCH) {
      [[b.cast, true], [b.nocast, false]].forEach(([arr, cast]) => {
        if (!arr.length) return;
        const g = THREE.BufferGeometryUtils.mergeBufferGeometries(arr, false);
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = cast; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        root.add(mesh);
      });
    }
    BATCH.clear();
  }

  // 局部坐标系：frame(x, y, rot, z) —— 家具以中心点为原点，正面朝 +y(南)，rot 顺时针
  function frame(xcm, ycm, rot = 0, zcm = 0) {
    return m4().makeTranslation(xcm / 100, zcm / 100, ycm / 100).multiply(m4().makeRotationY(-rot * DEG));
  }
  const T3 = (x, y, z) => m4().makeTranslation(x / 100, z / 100, y / 100);

  // 几何缓存
  const GC = {};
  function rbox(w, d, h, r) {
    const rr = Math.min(r || 0, w / 2 - 0.05, d / 2 - 0.05, h / 2 - 0.05);
    const k = `rb${w}|${d}|${h}|${rr}`;
    if (GC[k]) return GC[k];
    const g = rr > 0.2 ? new THREE.RoundedBoxGeometry(w / 100, h / 100, d / 100, rr > 3 ? 2 : 1, rr / 100) : new THREE.BoxGeometry(w / 100, h / 100, d / 100);
    return (GC[k] = g);
  }
  // 盒子：局部 (x,y) 中心，z 底面高度
  function B(F, x, y, z, w, d, h, mat, r = 0, cast = true, rot = 0) {
    const mm = F.clone().multiply(T3(x, y, z + h / 2));
    if (rot) mm.multiply(m4().makeRotationY(-rot * DEG));
    add(rbox(w, d, h, r), mat, mm, cast);
  }
  function Cy(F, x, y, z, r, h, mat, seg = 24, r2, cast = true) {
    const k = `cy${r}|${r2}|${h}|${seg}`;
    const g = GC[k] || (GC[k] = new THREE.CylinderGeometry((r2 == null ? r : r2) / 100, r / 100, h / 100, seg));
    add(g, mat, F.clone().multiply(T3(x, y, z + h / 2)), cast);
  }
  function Sp(F, x, y, z, r, sx, sy, sz, mat, cast = true) {
    const k = `sp${r}`;
    const g = GC[k] || (GC[k] = new THREE.SphereGeometry(r / 100, 24, 16));
    add(g, mat, F.clone().multiply(T3(x, y, z)).multiply(m4().makeScale(sx, sy, sz)), cast);
  }
  function Lathe(F, x, y, z, prof, mat, seg = 32, cast = true) {
    const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0] / 100, p[1] / 100)), seg);
    add(g, mat, F.clone().multiply(T3(x, y, z)), cast);
  }
  function Tube(F, pts, r, mat, seg = 20, cast = true) {
    const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0] / 100, p[2] / 100, p[1] / 100)));
    add(new THREE.TubeGeometry(c, seg, r / 100, 8, false), mat, F, cast);
  }
  // 平面（竖直，面朝 +y），用于画、屏幕
  function Plane(F, x, y, z, w, h, mat, cast = false) {
    const g = new THREE.PlaneGeometry(w / 100, h / 100);
    add(g, mat, F.clone().multiply(T3(x, y, z + h / 2)), cast);
  }
  // 接触阴影：地面柔边暗斑（不入合批，单独 mesh 便于透明排序）
  function contact(F, x, y, w, d, op = 0.45, z = 0.4) {
    const g = new THREE.PlaneGeometry(w / 100, d / 100).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, M.contact(op));
    mesh.applyMatrix4(F.clone().multiply(T3(x, y, z)));
    mesh.renderOrder = 1; root.add(mesh);
  }
  function collide(F, x, y, w, d, hcm = 90) {
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => new THREE.Vector3((x + a) / 100, 0, (y + b) / 100).applyMatrix4(F));
    const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
    COLL.boxes.push([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), hcm / 100]);
  }

  // ---------------------------------------------------------------- 几何工具
  function pointIn(x, y, poly) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function roomAt(x, y) { for (const r of H.rooms) if (pointIn(x, y, r.poly)) return r; return null; }
  function polyCenter(poly) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      a += f; cx += (poly[j][0] + poly[i][0]) * f; cy += (poly[j][1] + poly[i][1]) * f;
    }
    a *= 0.5; return [cx / (6 * a), cy / (6 * a)];
  }
  function polyGeom(poly, ycm, up) {
    const tris = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p[0], p[1])), []);
    const pos = [];
    tris.forEach(([a, b, c]) => (up ? [a, c, b] : [a, b, c]).forEach(i => pos.push(poly[i][0] / 100, ycm / 100, poly[i][1] / 100)));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    return g;
  }
  // 竖直面板（墙面材质），用于墙段与洞口上下的过梁/窗台墙
  function wallPiece(a, b, t, z0, z1, matL, matR, tag) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5 || z1 - z0 < 0.5) return;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    const nx = -Math.sin(ang), ny = Math.cos(ang);          // 左法线 (平面坐标)
    const F = m4().makeTranslation(cx / 100, 0, cy / 100).multiply(m4().makeRotationY(-ang));
    // 两个墙面分别用房间材质；墙芯 + 顶封
    const pl = new THREE.PlaneGeometry(L / 100, (z1 - z0) / 100);
    const yz = (z0 + z1) / 200;
    add(pl, matL, F.clone().multiply(m4().makeTranslation(0, yz, t / 200)), true);          // local +z = 平面左法线一侧
    add(pl, matR, F.clone().multiply(m4().makeTranslation(0, yz, -t / 200)).multiply(m4().makeRotationY(Math.PI)), true);
    // 端面与顶面
    const cap = new THREE.PlaneGeometry(L / 100, t / 100);
    add(cap, M.wallcap, F.clone().multiply(m4().makeTranslation(0, z1 / 100, 0)).multiply(m4().makeRotationX(-Math.PI / 2)), false);
    if (z0 > 1) add(cap, matL, F.clone().multiply(m4().makeTranslation(0, z0 / 100, 0)).multiply(m4().makeRotationX(Math.PI / 2)), false);
    COLL.segs.push([a[0] / 100, a[1] / 100, b[0] / 100, b[1] / 100, z0, z1]);
  }

  // ---------------------------------------------------------------- 房间材质
  function wallMatOf(room, wallId) {
    if (!room) return M.exterior;
    if (room.id === 'kitchen') return M.tile_kwall;
    if (room.id === 'balcony') return M.exterior;
    if (room.id === 'mbath') return wallId === room.accentWall ? M.bath_blush : M.bath_mb;
    if (room.id === 'gbath') return wallId === room.accentWall ? M.bath_blush : M.bath_gb;
    if (room.wall === 'wall_terracotta') return M.plaster_terra;
    if (room.wall === 'wall_warmwhite') return M.plaster_warm;
    return M.plaster_keep;
  }
  function floorMatOf(room) {
    if (room.id === 'living') return M.floor_living;
    if (room.floor === 'tile_grey') return M.tile_kfloor;
    if (room.floor === 'tile_warm') return M.tile_balcony;
    if (room.floor === 'limestone') return M.lime_floor;
    return M.floor_keep;
  }

  // ---------------------------------------------------------------- 墙 + 门窗
  function buildWalls() {
    H.walls.forEach(w => {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
      const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;   // 平面左法线（three 的 local +z 指向 (−sin, cos)）
      const at = t => [w.a[0] + ux * t, w.a[1] + uy * t];
      const t = Math.max(w.t || 12, 8);
      const rL = roomAt(w.a[0] + ux * L / 2 + nx * (t / 2 + 6), w.a[1] + uy * L / 2 + ny * (t / 2 + 6));
      const rR = roomAt(w.a[0] + ux * L / 2 - nx * (t / 2 + 6), w.a[1] + uy * L / 2 - ny * (t / 2 + 6));
      const mL = wallMatOf(rL, w.id), mR = wallMatOf(rR, w.id);
      const top = w.parapet ? w.parapet : WH;
      // 延长 t/2 让墙角闭合
      const ext = t / 2;
      const ops = (w.openings || []).slice().sort((a, b) => a.at - b.at);
      let cur = -ext;
      const pieces = [];
      ops.forEach(o => { pieces.push([cur, o.at - o.w / 2, null]); pieces.push([o.at - o.w / 2, o.at + o.w / 2, o]); cur = o.at + o.w / 2; });
      pieces.push([cur, L + ext, null]);
      pieces.forEach(([t0, t1, o]) => {
        if (t1 - t0 < 0.5) return;
        const a = at(t0), b = at(t1);
        if (!o) { wallPiece(a, b, t, 0, top, mL, mR); return; }
        const sill = o.sill || 0, head = sill + o.h;
        if (sill > 0) wallPiece(a, b, t, 0, sill, mL, mR);
        if (head < top) wallPiece(a, b, t, head, top, mL, mR);
        opening(w, o, at, ang, t, rL, rR);
      });
      if (w.parapet) {     // 阳台：矮墙 + 玻璃栏板 + 扶手
        const F = m4().makeTranslation((w.a[0] + w.b[0]) / 200, 0, (w.a[1] + w.b[1]) / 200).multiply(m4().makeRotationY(-ang));
        add(new THREE.BoxGeometry(L / 100, 0.95, 0.012), M.glass_win, F.clone().multiply(m4().makeTranslation(0, (w.parapet + 48) / 100, 0)), false);
        add(new THREE.BoxGeometry((L + 4) / 100, 0.04, 0.06), M.alu_win, F.clone().multiply(m4().makeTranslation(0, (w.parapet + 98) / 100, 0)), true);
        const nPost = Math.max(1, Math.round(L / 120));
        for (let k = 0; k <= nPost; k++)
          add(new THREE.BoxGeometry(0.03, 0.95, 0.03), M.alu_win, F.clone().multiply(m4().makeTranslation((-L / 2 + k * L / nPost) / 100, (w.parapet + 48) / 100, 0)), true);
        COLL.segs.push([w.a[0] / 100, w.a[1] / 100, w.b[0] / 100, w.b[1] / 100, 0, 210]);
      }
    });
  }

  function opening(w, o, at, ang, t, rL, rR) {
    const c = at(o.at), Wd = o.w;
    const F = m4().makeTranslation(c[0] / 100, 0, c[1] / 100).multiply(m4().makeRotationY(-ang));
    const L = (x, z, y = 0) => F.clone().multiply(m4().makeTranslation(x / 100, z / 100, y / 100));
    const box = (w, h, d) => new THREE.BoxGeometry(w / 100, h / 100, d / 100);
    const isWet = r => r && (r.id === 'mbath' || r.id === 'gbath' || r.id === 'kitchen');
    if (o.type === 'door' || o.type === 'entry') {
      const entry = o.type === 'entry';
      const fm = entry ? M.walnut_frame : M.door_frame, lm = entry ? M.walnut_door : M.door_leaf;
      const ft = t + 3, fw = 7;
      // 门套：左右立框 + 顶框（全部落地，覆盖墙厚）
      add(box(fw, o.h + fw, ft), fm, L(-Wd / 2 + fw / 2, (o.h + fw) / 2), true);
      add(box(fw, o.h + fw, ft), fm, L(Wd / 2 - fw / 2, (o.h + fw) / 2), true);
      add(box(Wd, fw, ft), fm, L(0, o.h + fw / 2), true);
      // 门套线（两侧贴墙 1.2cm 厚）
      [1, -1].forEach(sd => {
        add(box(5, o.h + 5, 1.2), fm, L(-Wd / 2 - 1.5, (o.h + 5) / 2, sd * (ft / 2 + 0.6)), false);
        add(box(5, o.h + 5, 1.2), fm, L(Wd / 2 + 1.5, (o.h + 5) / 2, sd * (ft / 2 + 0.6)), false);
        add(box(Wd + 8, 5, 1.2), fm, L(0, o.h + 2.5, sd * (ft / 2 + 0.6)), false);
      });
      // 门扇：铰链侧 + 开启方向
      const leafW = Wd - fw * 2 - 0.6, leafH = o.h - 1.2;
      const hingeA = o.hinge !== 'b';
      // 开向哪一侧：swingTo 指定房间方位，否则开向非走道（小房间）一侧
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      let side = 1;               // +1 → local +z（平面左法线一侧）
      if (o.swingTo) { const d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[o.swingTo]; side = (d[0] * nx + d[1] * ny) > 0 ? 1 : -1; }
      else if (rL && rR) side = (rL.area || 99) < (rR.area || 99) ? 1 : -1;
      else side = rL ? 1 : -1;
      if (entry) side = rL && rL.id === 'foyer' ? 1 : -1;
      const open = entry ? 0 : 0.5 * Math.PI;      // 室内门开到 90°，贴墙不挡视线
      const pivotX = hingeA ? -Wd / 2 + fw + 0.3 : Wd / 2 - fw - 0.3;
      const sgnX = hingeA ? 1 : -1;
      const Pv = F.clone().multiply(m4().makeTranslation(pivotX / 100, 0, side * (ft / 2 - 2.2) / 100)).multiply(m4().makeRotationY(-side * sgnX * open));
      const LL = (x, z, y = 0) => Pv.clone().multiply(m4().makeTranslation(x / 100, z / 100, y / 100));
      const leaf = new THREE.Group();
      const leafMats = [];
      const lw = (x, z, y, g, mat) => { const mesh = new THREE.Mesh(g, mat); mesh.position.set(x / 100, z / 100, y / 100); mesh.castShadow = true; mesh.receiveShadow = true; leaf.add(mesh); leafMats.push(mesh); };
      lw(sgnX * leafW / 2, 0.6 + leafH / 2, 0, box(leafW, leafH, 4), lm);
      if (!entry) {
        // 竖向凹槽两条（参考图门板的分缝）
        [0.33, 0.66].forEach(f => lw(sgnX * leafW * f, 0.6 + leafH / 2, 2.05, box(0.5, leafH - 30, 0.2), M.walnut));
      } else {
        lw(sgnX * leafW * 0.5, 0.6 + leafH / 2, 2.05, box(0.6, leafH - 20, 0.2), M.plinth_dark);
      }
      // 把手：执手 + 圆形门锁（两面）
      [1, -1].forEach(sd => {
        const hx = sgnX * (leafW - 7);
        lw(hx, 102, sd * 3.2, new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20).rotateX(Math.PI / 2), M.black_metal);
        const lever = box(12, 1.8, 1.8); lever.translate(-sgnX * 0.055, 0, 0);
        lw(hx, 102, sd * 4.4, lever, M.black_metal);
        lw(hx, 92, sd * 2.4, new THREE.CylinderGeometry(0.018, 0.018, 0.008, 18).rotateX(Math.PI / 2), M.black_metal);
        if (entry) lw(hx, 125, sd * 3.5, box(5.5, 24, 2.5), M.glass_black);
      });
      leaf.applyMatrix4(Pv);
      leaf.userData = { F, Pv, side, open };
      root.add(leaf);
      DYN.doors.push(leaf);
      // 门槛石（湿区）
      if (isWet(rL) || isWet(rR)) add(box(Wd, 1.2, ft), M.stone_sill, L(0, 0.6), false);
      // 打开的门扇作为碰撞物（简化为门扇当前位置的薄墙）
      const p0 = new THREE.Vector3(0, 0, 0).applyMatrix4(Pv), p1 = new THREE.Vector3(sgnX * leafW / 100, 0, 0).applyMatrix4(Pv);
      COLL.segs.push([p0.x, p0.z, p1.x, p1.z, 0, 210]);
    } else if (o.type === 'slider') {
      const n = Wd > 300 ? 4 : 2, h = o.h, ft = t + 2;
      add(box(Wd, 6, ft), M.alu_win, L(0, h - 3), true);
      add(box(Wd, 1.6, ft), M.alu_win, L(0, 0.8), false);
      [-1, 1].forEach(s => add(box(5, h, ft), M.alu_win, L(s * (Wd / 2 - 2.5), h / 2), true));
      // 门扇：2 扇时一扇推开；4 扇时中间两扇推向两侧，形成可通行的开口
      const pw = (Wd - 10) / n;
      for (let k = 0; k < n; k++) {
        let x = -Wd / 2 + 5 + pw * (k + 0.5), y = (k % 2 ? -1 : 1) * 2.2;
        if (n === 4) { if (k === 1) x -= pw * 0.85; if (k === 2) x += pw * 0.85; }
        else if (k === 1) x -= pw * 0.8;
        add(box(pw + 2, h - 10, 0.8), o.w > 300 ? M.glass_win : M.glass_frost, L(x, h / 2, y), false);
        add(box(pw + 2, 4, 3.4), M.alu_win, L(x, 5, y), true);
        add(box(pw + 2, 4, 3.4), M.alu_win, L(x, h - 8, y), true);
        [-1, 1].forEach(s => add(box(4, h - 10, 3.4), M.alu_win, L(x + s * (pw / 2 - 1), h / 2, y), true));
      }
      if (n === 2 && isWet(rL || rR)) add(box(Wd, 1.2, ft), M.stone_sill, L(0, 0.6), false);
    } else {
      // 窗 / 飘窗
      const sill = o.sill, h = o.h;
      const room = rL || rR;
      const inSide = rL ? 1 : -1;                  // 室内在 local +z 还是 -z
      const bay = o.type === 'bay', dep = bay ? (o.depth || 40) : 0;
      const ft = 7;
      const outZ = -inSide * (t / 2 + dep);         // 窗框所在（飘窗外推）
      const glassMat = room && (room.id === 'mbath' || room.id === 'gbath') ? M.glass_bath : M.glass_win;
      // 框
      const fz = bay ? outZ + inSide * 3 : 0;
      add(box(Wd, 5, ft), M.alu_win, L(0, sill + 2.5, fz), true);
      add(box(Wd, 5, ft), M.alu_win, L(0, sill + h - 2.5, fz), true);
      [-1, 1].forEach(s => add(box(5, h, ft), M.alu_win, L(s * (Wd / 2 - 2.5), sill + h / 2, fz), true));
      const nM = Wd > 150 ? 3 : Wd > 90 ? 2 : 1;
      for (let k = 1; k < nM; k++) add(box(4, h - 10, ft - 1), M.alu_win, L(-Wd / 2 + Wd * k / nM, sill + h / 2, fz), true);
      add(box(Wd - 6, h - 6, 0.8), glassMat, L(0, sill + h / 2, fz), false);
      if (bay) {
        // 飘窗：台面（石材）+ 两侧墙 + 顶板，外凸
        const zc = -inSide * (t / 2 + dep / 2) + inSide * 3;
        add(box(Wd + 2, 6, dep + t + 8), M.stone_sill, L(0, sill - 3, zc + inSide * 4), true);
        add(box(Wd + 2, sill - 6, dep + t), M.exterior, L(0, (sill - 6) / 2, zc), true);
        add(box(Wd + 2, 12, dep + t), M.plaster_warm, L(0, sill + h + 6, zc), true);
        [-1, 1].forEach(s => add(box(t, h, dep + t), M.plaster_warm, L(s * (Wd / 2 + t / 2), sill + h / 2, zc), true));
        DYN.bays.push({ F, Wd, sill, dep, inSide, t, room: room && room.id });
      } else {
        add(box(Wd + 6, 2.4, t + 6), M.stone_sill, L(0, sill - 1.2, inSide * 3), false);
        // 窗洞内侧收口（左右 + 顶），避免看进墙体空腔
        const rm = wallMatOf(room, w.id);
        [-1, 1].forEach(s => add(box(1, h, t), rm, L(s * (Wd / 2 - 0.5), sill + h / 2), false));
        add(box(Wd, 1, t), rm, L(0, sill + h - 0.5), false);
      }
    }
  }

  // ---------------------------------------------------------------- 地面 / 吊顶 / 踢脚线 / 灯槽
  function buildFloorsCeilings() {
    H.rooms.forEach(r => {
      add(polyGeom(r.poly, 0, true), floorMatOf(r), null, false);
      if (r.outdoor) return;
      // 天花：独立 mesh，俯瞰时隐藏
      const g = polyGeom(r.poly, CH, false);
      const ce = new THREE.Mesh(g, M.ceiling); ce.receiveShadow = true; ce.castShadow = true; ce.name = 'ceiling';
      ce.userData.room = r.id;
      root.add(ce); DYN.ceilings.push(ce);
    });
    // 阳台顶板（上层楼板）
    const bal = rooms.balcony;
    if (bal) { const g = polyGeom(bal.poly, WH, false); const ce = new THREE.Mesh(g, M.exterior); ce.castShadow = true; ce.receiveShadow = true; root.add(ce); DYN.ceilings.push(ce); }
    // 踢脚线 + 墙角 AO + 吊顶灯槽：沿每面墙的室内侧铺设，门洞/推拉门处断开，贴合真实墙厚
    const coveSet = new Set(H.lighting.coveRooms || []);
    H.walls.forEach(w => {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
      const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      const t = Math.max(w.t || 12, 8);
      const gaps = (w.openings || []).filter(o => o.type === 'door' || o.type === 'entry' || o.type === 'slider')
        .map(o => [o.at - o.w / 2 - 4, o.at + o.w / 2 + 4]).sort((a, b) => a[0] - b[0]);
      const spans = []; let c0 = 0;
      gaps.forEach(([g0, g1]) => { if (g0 > c0) spans.push([c0, g0]); c0 = Math.max(c0, g1); });
      if (c0 < L) spans.push([c0, L]);
      [1, -1].forEach(sd => {
        const mx = w.a[0] + ux * L / 2 + sd * nx * (t / 2 + 6), my = w.a[1] + uy * L / 2 + sd * ny * (t / 2 + 6);
        const r = roomAt(mx, my); if (!r || r.outdoor) return;
        const wet = r.id === 'kitchen' || r.id === 'mbath' || r.id === 'gbath';
        const off = sd * (t / 2) / 100;                 // 墙面所在 local z
        const F0 = m4().makeTranslation(w.a[0] / 100, 0, w.a[1] / 100).multiply(m4().makeRotationY(-ang));
        spans.forEach(([s0, s1]) => {
          const len = s1 - s0; if (len < 15) return;
          const F = F0.clone().multiply(m4().makeTranslation((s0 + s1) / 200, 0, 0));
          if (!wet) add(new THREE.BoxGeometry(len / 100, 0.08, 0.012), M.baseboard, F.clone().multiply(m4().makeTranslation(0, 0.04, off + sd * 0.006)), false);
          aoStrip(F, len, sd, off, 0.0, 0.22, M.ao, false);
          aoStrip(F, len, sd, off, CH / 100, 0.32, M.ao_ceil, true);
        });
        // 灯槽：整面墙（门洞上方也连续），四角各缩进 14cm
        if (coveSet.has(r.id) && L > 60) {
          const F = F0.clone().multiply(m4().makeTranslation(L / 200, 0, 0));
          const len = L - 28, drop = 10;
          add(new THREE.BoxGeometry(len / 100, drop / 100, 0.012), M.plaster_keep, F.clone().multiply(m4().makeTranslation(0, (CH - drop / 2) / 100, off + sd * 0.12)), false);
          add(new THREE.BoxGeometry(len / 100, 0.01, 0.12), M.plaster_keep, F.clone().multiply(m4().makeTranslation(0, (CH - drop) / 100, off + sd * 0.06)), false);
          add(new THREE.BoxGeometry(len / 100, 0.01, 0.012), M.led, F.clone().multiply(m4().makeTranslation(0, (CH - drop + 1.2) / 100, off + sd * 0.04)), false);
          washQuad(F, len, sd, off, CH - drop, 95, r.id === 'living' ? M.wash : M.wash_cool);
        }
      });
    });
  }
  function polyArea(P) { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j][0] * P[i][1] - P[i][0] * P[j][1]); return s / 2; }
  // sd=+1 表示室内在 local +z 一侧（平面左法线）
  function aoStrip(F, L, sd, off, ym, hgt, mat, down) {
    const g = new THREE.PlaneGeometry(L / 100, hgt);
    g.translate(0, down ? -hgt / 2 : hgt / 2, 0);
    if (!down) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }   // 地脚：底部最暗
    const mesh = new THREE.Mesh(g, mat);
    mesh.applyMatrix4(F.clone().multiply(m4().makeTranslation(0, ym, off + sd * 0.004)).multiply(m4().makeRotationY(sd > 0 ? 0 : Math.PI)));
    mesh.renderOrder = 1; root.add(mesh); DYN.overlays.push(mesh);
  }
  function washQuad(F, L, sd, off, topcm, hcm, mat) {
    const g = new THREE.PlaneGeometry(L / 100, hcm / 100);
    g.translate(0, -hcm / 200, 0);            // 顶部最亮（灯槽处），向下衰减
    const mesh = new THREE.Mesh(g, mat);
    mesh.applyMatrix4(F.clone().multiply(m4().makeTranslation(0, topcm / 100, off + sd * 0.008)).multiply(m4().makeRotationY(sd > 0 ? 0 : Math.PI)));
    mesh.renderOrder = 2; root.add(mesh); DYN.washes.push(mesh);
  }

  // 轨道灯
  function buildTracks() {
    (H.lighting.tracks || []).forEach(tr => {
      const ax = tr.a[0], ay = tr.a[1], bx = tr.b[0], by = tr.b[1];
      const L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax) / DEG;
      const F = frame((ax + bx) / 2, (ay + by) / 2, ang);
      B(F, 0, 0, CH - 4, L, 2.6, 3.4, M.fixture, 0.4, false);
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const G = frame(x, y, 0);
        Cy(G, 0, 0, CH - 9, 0.8, 5, M.fixture, 8, null, false);
        const tilt = m4().makeRotationX((k % 2 ? 22 : -18) * DEG).multiply(m4().makeRotationZ((k % 2 ? -10 : 12) * DEG));
        const H2 = G.clone().multiply(T3(0, 0, CH - 12)).multiply(tilt);
        add(new THREE.CylinderGeometry(0.028, 0.028, 0.11, 20), M.fixture, H2.clone().multiply(m4().makeTranslation(0, -0.04, 0)), false);
        add(new THREE.CircleGeometry(0.02, 16).rotateX(Math.PI / 2), M.lens, H2.clone().multiply(m4().makeTranslation(0, -0.096, 0)), false);
        DYN.lights.push({ kind: 'spot', x, y, z: CH - 15, tx: x + (k % 2 ? 40 : -35), ty: y + (k % 2 ? 25 : -20) });
      }
    });
  }

  // ---------------------------------------------------------------- 家具
  const FURN = {};
  // 低矮模块沙发（插画同款：厚坐垫、窄扶手、两只靠枕 + 搭毯）
  FURN.sofa = (F, f) => {
    const w = f.w, d = f.d;
    B(F, 0, 0, 0, w - 8, d - 8, 4, M.plinth_dark, 1);
    B(F, 0, 2, 4, w, d, 30, M.linen_oat, 7);
    const nS = 3, sw = (w - 36) / nS;
    for (let k = 0; k < nS; k++) {
      B(F, -w / 2 + 18 + sw * (k + 0.5), 9, 34, sw - 1.5, d - 28, 15, M.linen_oat, 7);
      // 靠背枕：微后倾、圆鼓
      const P = F.clone().multiply(T3(-w / 2 + 18 + sw * (k + 0.5), -d / 2 + 15, 46)).multiply(m4().makeRotationX(-0.16));
      add(rbox(sw - 2, 20, 38, 9), M.linen_oat, P.multiply(T3(0, 0, 19)), true);
    }
    B(F, 0, -d / 2 + 6, 34, w - 20, 12, 30, M.linen_oat, 5);
    [-1, 1].forEach(s => B(F, s * (w / 2 - 9), 2, 34, 18, d, 24, M.linen_oat, 8.5));
    [[-60, M.linen_sand, -6], [-15, M.linen_white, 4], [62, M.linen_taupe, -3]].forEach(([x, mat, r]) => {
      const P = F.clone().multiply(T3(x, -d / 2 + 30, 54)).multiply(m4().makeRotationX(-0.28)).multiply(m4().makeRotationY(r * DEG));
      add(rbox(46, 13, 42, 6), mat, P, true);
    });
    // 搭毯：扶手到坐垫
    const P = F.clone().multiply(T3(w / 2 - 34, 12, 52)).multiply(m4().makeRotationZ(-0.1));
    add(rbox(48, 56, 2.2, 1), M.linen_grey, P, true);
    B(F, w / 2 - 12, 32, 18, 22, 3, 32, M.linen_grey, 1);
    contact(F, 0, 0, w + 16, d + 16, 0.55);
    collide(F, 0, 0, w, d);
  };
  FURN.armchair = (F, f) => {
    const w = f.w, d = f.d;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => B(F, sx * (w / 2 - 6), sy * (d / 2 - 6), 0, 3.5, 3.5, 14, M.oak_honey, 1));
    B(F, 0, 0, 14, w, d, 22, M.boucle_cream, 8);
    B(F, 0, 6, 34, w - 18, d - 20, 10, M.boucle_cream, 5);
    const P = F.clone().multiply(T3(0, -d / 2 + 12, 34)).multiply(m4().makeRotationX(-0.12));
    add(rbox(w - 4, 18, 42, 9), M.boucle_cream, P.multiply(T3(0, 0, 21)), true);
    [-1, 1].forEach(s => B(F, s * (w / 2 - 8), 0, 34, 16, d - 6, 18, M.boucle_cream, 8));
    contact(F, 0, 0, w + 10, d + 10, 0.4);
    collide(F, 0, 0, w, d);
  };
  // 椭圆实木茶几（插画同款：厚台面 + 两块板腿）+ 茶壶托盘
  FURN.coffeetable = (F, f) => {
    const r = f.r, h = f.h;
    const sh = new THREE.Shape(); sh.absellipse(0, 0, r * 1.35 / 100, r * 0.82 / 100, 0, Math.PI * 2);
    const top = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 48 });
    top.rotateX(-Math.PI / 2);
    add(top, M.oak_honey, F.clone().multiply(T3(0, 0, h - 5)), true);
    [-1, 1].forEach(s => B(F, s * r * 0.55, 0, 0, 10, r * 0.9, h - 5, M.oak_honey, 1.5));
    Cy(F, -r * 0.4, -6, h, 13, 1.4, M.walnut, 36);
    Lathe(F, -r * 0.4, -6, h + 1.4, [[0, 0], [5, 0], [7.5, 4], [6.6, 8.5], [3.4, 10.5], [2, 11.5], [0, 11.5]], M.iron, 28);
    Tube(F, [[-r * 0.4 - 5, -6, h + 11], [-r * 0.4, -6, h + 15], [-r * 0.4 + 5, -6, h + 11]], 0.35, M.iron, 12);
    Cy(F, -r * 0.4 + 8, 2, h + 1.4, 3, 4, M.ceramic, 18);
    Cy(F, r * 0.55, 8, h, 12, 2.5, M.ceramic_sand, 24);
    for (let k = 0; k < 3; k++) B(F, r * 0.1, -10, h + k * 2.2, 24 - k * 2, 17 - k, 2.2, [M.books[0], M.books[2], M.books[5]][k], 0.3, true, 8 * k);
    contact(F, 0, 0, r * 2.9, r * 1.9, 0.38);
    collide(F, 0, 0, r * 2.4, r * 1.5);
  };
  FURN.tvwall = (F, f) => { /* 墙面同硅藻泥，不另做 */ };
  // 悬浮胡桃木电视柜：抽屉 + 开放格 + 底部灯带
  FURN.tvstand = (F, f) => {
    const w = f.w, d = f.d, h = f.h + 8, z = f.elev;
    B(F, 0, 0, z, w, d, h, M.walnut, 0.8);
    const cols = 4, cw = w / cols;
    for (let k = 0; k < cols; k++) {
      const x = -w / 2 + cw * (k + 0.5);
      if (k === 1) {
        B(F, x, d / 2 - 14, z + 2, cw - 3, 26, h - 4, M.plinth_dark, 0.3);
        for (let q = 0; q < 4; q++) B(F, x - cw * 0.35 + q * 6, d / 2 - 14, z + 2.5, 4.5, 18, 22 - q * 2, M.books[q + 2], 0.3);
      } else {
        B(F, x, d / 2 + 0.3, z + 1.5, cw - 1.2, 1.2, h - 3, M.walnut_v, 0.2);
        B(F, x, d / 2 + 1, z + h / 2, 10, 1, 1.2, M.brass, 0.3);
      }
    }
    // 灯带光晕（地面）
    const g = new THREE.PlaneGeometry(w / 100, 0.5).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, M.ceilglow); mesh.applyMatrix4(F.clone().multiply(T3(0, d / 2 - 4, 0.6))); root.add(mesh); DYN.ceilGlows.push(mesh);
    add(new THREE.BoxGeometry(w / 100 - 0.04, 0.008, 0.01), M.led, F.clone().multiply(T3(0, d / 2 - 6, z - 0.4)), false);
    // 陶罐 + 小盆栽 + 书
    Lathe(F, -w * 0.38, 0, z + h, [[0, 0], [6, 0], [10, 7], [9, 14], [5, 18], [4.5, 20], [0, 20]], M.ceramic_clay, 28);
    Lathe(F, -w * 0.28, 2, z + h, [[0, 0], [4, 0], [6, 5], [4.5, 10], [2.2, 12], [0, 12]], M.terracotta, 24);
    for (let k = 0; k < 2; k++) B(F, w * 0.08, 0, z + h + k * 3, 30 - k * 3, 22, 3, M.books[k * 4], 0.3, true, k * 6);
    window.NATIVE_PLANTS.build('rubber', F.clone().multiply(T3(w * 0.38, 0, z + h)), 0.42, add, M, 31, M.ceramic_white);
    contact(F, 0, 0, w + 12, d + 30, 0.18);
  };
  // 艺术画框电视（插画同款：Frame TV 显示抽象画）
  FURN.tv = (F, f) => {
    const w = f.w, h = f.h, z = f.elev;
    B(F, 0, -2, z - 2, w + 6, 3, h + 4, M.oak_honey, 0.4);
    Plane(F, 0, 0, z, w, h, M.tv_art);
  };
  // 实木餐桌 + 藤编弯木椅（插画同款）+ 餐具 + 花瓶
  function caneChair(F) {
    const sh = 46, sw = 44, sd = 44;
    [[-1, 1], [1, 1]].forEach(([sx, sy]) => Tube(F, [[sx * 19, sy * 19, 0], [sx * 19.5, sy * 19.5, 22], [sx * 20, sy * 19, sh - 2]], 1.6, M.bentwood, 8));
    [-1, 1].forEach(sx => Tube(F, [[sx * 18, -18, 0], [sx * 19, -19, sh], [sx * 18, -22, 70], [sx * 14, -23, 86]], 1.6, M.bentwood, 16));
    Tube(F, [[-14, -23, 86], [-6, -25.5, 87], [6, -25.5, 87], [14, -23, 86]], 1.5, M.bentwood, 16);
    Tube(F, [[-20, 18, sh - 2], [-12, 22, sh - 1], [12, 22, sh - 1], [20, 18, sh - 2]], 1.4, M.bentwood, 12);
    B(F, 0, 0, sh - 3, sw, sd, 3, M.bentwood, 1.2);
    B(F, 0, 0, sh + 0.05, sw - 6, sd - 6, 0.6, M.cane, 0.2, true);
    const P = F.clone().multiply(T3(0, -22.5, 74)).multiply(m4().makeRotationX(-0.12));
    add(new THREE.PlaneGeometry(0.3, 0.2), M.cane, P, true);
    Tube(F, [[-18, -8, 14], [18, -8, 14]], 0.9, M.bentwood, 4);
    Tube(F, [[-18, 12, 18], [18, 12, 18]], 0.9, M.bentwood, 4);
  }
  FURN.dining = (F, f) => {
    const w = f.w, d = f.d, h = f.h;
    B(F, 0, 0, h - 4, w, d, 4, M.oak_honey, 0.8);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      B(F, sx * (w / 2 - 10), sy * (d / 2 - 9), 0, 6, 6, h - 4, M.oak_honey, 1);
    });
    [-1, 1].forEach(s => B(F, 0, s * (d / 2 - 9), h - 12, w - 26, 2.4, 8, M.oak_honey, 0.4));
    // 桌旗 + 餐具
    B(F, 0, 0, h, w * 0.55, 30, 0.3, M.linen_sand, 0.1, false);
    [[-w * 0.28, d / 2 - 18], [w * 0.28, d / 2 - 18], [-w * 0.28, -d / 2 + 18], [w * 0.28, -d / 2 + 18]].forEach(([x, y]) => {
      Lathe(F, x, y, h, [[0, 0], [9, 0], [12, 1.4], [12.4, 1.8], [0, 1.2]], M.ceramic_white, 36);
      Lathe(F, x + 13, y - 4, h, [[0, 0], [3.2, 0], [3.2, 0.4], [0.5, 1], [0.5, 9], [3.6, 12], [3.6, 18], [0, 13]], M.glass_clear, 20, false);
    });
    window.NATIVE_PLANTS.build('eucalyptus', F.clone().multiply(T3(0, 0, h)), 0.62, add, M, 77, M.ceramic_sand);
    [[-w * 0.28, d / 2 + 26, 180], [w * 0.28, d / 2 + 26, 180], [-w * 0.28, -d / 2 - 26, 0], [w * 0.28, -d / 2 - 26, 0]].forEach(([x, y, r]) => {
      caneChair(F.clone().multiply(T3(x, y, 0)).multiply(m4().makeRotationY(-r * DEG)));
    });
    contact(F, 0, 0, w + 30, d + 120, 0.32);
    collide(F, 0, 0, w, d);
  };
  // 纸灯笼吊灯（参考图同款）
  FURN.pendant = (F, f) => {
    const r = f.r, z = f.elev;
    Cy(F, 0, 0, z + r * 1.4, 0.25, CH - z - r * 1.4, M.fixture, 6, null, false);
    Cy(F, 0, 0, CH - 1, 6, 1, M.plastic_white, 24, null, false);
    const prof = []; for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + Math.PI * k / 16; prof.push([Math.max(0.6, Math.cos(a) * r), (Math.sin(a) + 1) * r * 0.62]); }
    Lathe(F, 0, 0, z, prof, M.lantern, 40, false);
    Cy(F, 0, 0, z + r * 1.24 - 1.4, 5, 1.6, M.lantern, 24, null, false);
    DYN.lights.push({ kind: 'pendant', x: f.x, y: f.y, z: z + r * 0.6 });
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.3 / 100, r * 2.3 / 100), M.halo);
    hm.position.set(f.x / 100, (z + r * 0.62) / 100, f.y / 100); hm.userData.billboard = true; root.add(hm); DYN.halos.push(hm);
  };
  // 独立岛台：略高略长，南端微蒸烤内腔，北端意式咖啡区，中部吧台座面
  FURN.island = (F, f) => {
    const w = f.w, d = f.d, h = f.h;
    B(F, 0, 0, 0, w, d - 2, 10, M.plinth_dark, 0.3);
    B(F, 0, 0, 10, w, d - 4, h - 14, M.oak_honey, 0.5);
    B(F, 0, 0, h - 4, w + 6, d + 6, 5, M.stone_counter, 0.6);
    // 南端微蒸烤一体（黑玻璃内腔 + 不锈钢框 + 拉手）
    const oy = d / 2 - 3;
    B(F, 0, oy - 0.4, 16, w - 40, 1.2, 56, M.steel, 1);
    B(F, 0, oy + 0.3, 20, w - 46, 0.6, 48, M.glass_black, 0.5, false);
    B(F, 0, oy + 0.8, 63, w - 52, 1, 2.4, M.steel, 0.4);
    B(F, 0, oy + 0.8, 15.5, w - 52, 1, 1.2, M.steel, 0.3);
    // 北端抽屉 + 咖啡区
    for (let k = 0; k < 3; k++) B(F, -w / 2 + w / 6 + k * w / 3, -d / 2 + 1.6, 14, w / 3 - 1, 1, h - 20, M.oak_light, 0.2);
    const cx = w * 0.2;
    B(F, cx, -6, h + 1, 30, 26, 30, M.steel, 1.6);
    B(F, cx, 7, h + 8, 22, 2, 3, M.black_metal, 0.5);
    Cy(F, cx - 6, 3, h + 9, 2.4, 4, M.black_metal, 16);
    B(F, cx - 24, -4, h + 1, 12, 18, 14, M.black_metal, 0.8);
    Cy(F, cx - 24, -4, h + 15, 5, 8, M.glass_black, 20);
    Lathe(F, -w * 0.3, -6, h + 1, [[0, 0], [4, 0], [5, 8], [3.4, 15], [0, 15]], M.ceramic_white, 20);
    B(F, -w * 0.06, -8, h + 1, 26, 16, 1.4, M.walnut, 0.4);
    contact(F, 0, 0, w + 12, d + 20, 0.36);
    collide(F, 0, 0, w, d);
  };
  // 中圆餐桌 + 4 藤编椅
  FURN.dininground = (F, f) => {
    const r = f.r, h = f.h;
    Cy(F, 0, 0, h - 4, r, 4, M.oak_honey, 48);
    Cy(F, 0, 0, 4, 6, h - 8, M.oak_honey, 20);
    Cy(F, 0, 0, 0, r * 0.55, 4, M.oak_honey, 32);
    Lathe(F, 0, 0, h, [[0, 0], [8, 0], [11, 1.4], [11.4, 1.8], [0, 1.2]], M.ceramic_white, 32);
    [[0, -r - 26, 0], [0, r + 26, 180], [-r - 26, 0, 90], [r + 26, 0, 270]].forEach(([x, y, a]) => {
      caneChair(F.clone().multiply(T3(x, y, 0)).multiply(m4().makeRotationY(-a * DEG)));
    });
    contact(F, 0, 0, r * 2 + 100, r * 2 + 100, 0.3);
    collide(F, 0, 0, r * 2, r * 2);
  };
  // 步入式衣帽间（frame 中心 world 1190,165）：西/北/东通顶柜 + 窗下低柜 + 中央中岛
  FURN.walkincloset = (F, f) => {
    const H2 = 270;
    // 西墙通顶柜 world x1040..1100, y15..315
    B(F, -120, 15, 0, 60, 300, H2, M.oak_light, 0.4);
    for (let k = 0; k < 5; k++) { B(F, -89.4, -120 + 30 + k * 60, 1, 0.8, 54, H2 - 3, M.oak_pale, 0.15); B(F, -88.6, -120 + 60 + k * 60, 1, 0.4, 54, H2 - 4, M.plinth_dark, 0.6); }
    // 北墙西段通顶柜 world x1045..1185, y5..65（门在窗西侧）
    B(F, -75, -130, 0, 140, 60, H2, M.oak_light, 0.4);
    B(F, -75, -100.2, 1, 0.8, 54, H2 - 3, M.oak_pale, 0.15); B(F, -75, -103.2, 1, 0.4, 54, H2 - 4, M.plinth_dark, 0.6); B(F, -75, -96.8, 1, 0.4, 54, H2 - 4, M.plinth_dark, 0.6);
    // 北窗下低柜 / 梳妆台 world x1200..1335, y10..56
    B(F, 77, -132, 0, 135, 46, 90, M.oak_light, 0.4);
    B(F, 77, -108.4, 2, 64, 0.9, 80, M.oak_pale, 0.15); B(F, 77, -108.4, 2, 0.9, 0.9, 80, M.oak_pale, 0.15);
    add(new THREE.BoxGeometry(1.2 / 100, 0.006, 0.01), M.led, F.clone().multiply(T3(77, -107, 89)), false);
    // 东墙柜 world x1280..1340, y50..190（避开门 y205..275）
    B(F, 120, -45, 0, 60, 140, H2, M.oak_light, 0.4);
    B(F, 89.4, -45, 1, 0.8, 134, H2 - 3, M.oak_pale, 0.15); [0,-1].forEach(q=>B(F, 88.6, -92 + q * 47, 1, 0.4, 130, H2 - 4, M.plinth_dark, 0.6));
    // 柜内灯条
    B(F, -75, -99, H2 - 6, 130, 1.2, 1.2, M.led, 0, false);
    B(F, 120, -99, H2 - 6, 1.2, 120, 1.2, M.led, 0, false);
    // 中央抽屉中岛 world 1135..1245, y135..195
    B(F, 0, 0, 0, 110, 60, 85, M.oak_honey, 0.5);
    B(F, 0, 0, 85, 116, 66, 4, M.stone_counter, 0.5);
    [10, 34, 58].forEach(z => { B(F, 0, 31.5, z, 104, 0.9, 22, M.oak_pale, 0.2); B(F, 0, -31.5, z, 104, 0.9, 22, M.oak_pale, 0.2); });
    Lathe(F, 0, 0, 89, [[0, 0], [6, 0], [8, 4], [6, 12], [0, 12]], M.ceramic_sand, 20);
    window.NATIVE_PLANTS.build('bush', F.clone().multiply(T3(-38, -18, 89)), 0.22, add, M, 88, M.ceramic_white);
    collide(F, 0, 0, 110, 60);
  };
  // 吧台（已弃用，保留兼容）
  FURN.bar = (F, f) => {
    const w = f.w, d = f.d, h = f.h;
    B(F, 0, 0, 0, w, d - 2, 10, M.plinth_dark, 0.3);
    B(F, 0, 0, 10, w, d - 4, h - 14, M.oak_honey, 0.6);
    for (let k = 0; k < 4; k++) B(F, -w / 2 + w / 8 + k * w / 4, d / 2 - 1.6, 12, w / 4 - 0.8, 1.2, h - 18, M.oak_light, 0.2);
    B(F, 0, 0, h - 4, w + 4, d + 4, 4, M.stone_counter, 0.6);
    // 咖啡机（不锈钢）
    const cx = w * 0.22;
    B(F, cx, -6, h, 34, 30, 34, M.steel, 2);
    B(F, cx, 9, h + 8, 24, 2, 3, M.black_metal, 0.6);
    Cy(F, cx - 6, 4, h + 9, 2.6, 4, M.black_metal, 16);
    Cy(F, cx, -10, h + 34, 7, 10, M.glass_clear, 20);
    B(F, cx + 26, -4, h, 13, 20, 36, M.steel, 1.6);
    Cy(F, cx + 26, -4, h + 36, 6, 9, M.glass_black, 20);
    for (let k = 0; k < 3; k++) Lathe(F, -w * 0.12 + k * 10, 4, h, [[0, 0], [3, 0], [4, 1], [4.4, 7], [0, 6.5]], M.ceramic_white, 20);
    Cy(F, -w * 0.32, -8, h, 14, 2, M.walnut, 28);
    [[-w * 0.42, M.ceramic], [-w * 0.37, M.ceramic_sand]].forEach(([x, mat], i) => Lathe(F, x, -10, h, [[0, 0], [4, 0], [5.5, 6], [4, 12 + i * 3], [2, 14 + i * 3], [0, 14 + i * 3]], mat, 20));
    contact(F, 0, 0, w + 10, d + 16, 0.35);
    collide(F, 0, 0, w, d);
  };
  FURN.art = (F, f) => {
    const w = f.w, h = f.h, z = f.elev;
    // 参考全景：对开松树挂画（两幅）
    [-1, 1].forEach((s, i) => {
      B(F, s * (w * 0.27), 1, z - 2, w * 0.52 + 4, 3, h + 4, M.walnut, 0.3);
      Plane(F, s * (w * 0.27), 2.6, z, w * 0.52 - 3, h - 3, i ? M.art_pine2 : M.art_pine1);
    });
  };
  FURN.floorlamp = (F, f) => {
    Cy(F, 0, 0, 0, 12, 2, M.black_metal, 28);
    Tube(F, [[0, 0, 2], [0, 0, f.h * 0.6], [3, 0, f.h - 14]], 0.8, M.brass, 16);
    Lathe(F, 3, 0, f.h - 22, [[22, 0], [21.6, 0.5], [9, 18], [8.6, 18.2]], M.shade, 40, false);
    DYN.lights.push({ kind: 'lamp', x: f.x, y: f.y, z: f.h - 12 });
    contact(F, 0, 0, 34, 34, 0.35);
    collide(F, 0, 0, 26, 26);
  };
  // 亚麻窗帘：遮光帘 + 纱帘（褶皱为正弦面）
  function drape(F, x, y, w, h, mat, amp, folds, z0 = 0) {
    const nx = Math.max(16, folds * 6), g = new THREE.PlaneGeometry(w / 100, h / 100, nx, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) / (w / 100) * Math.PI * 2 * folds) * amp / 100);
    g.computeVertexNormals();
    add(g, mat, F.clone().multiply(T3(x, y, z0 + h / 2)), mat !== M.sheer);
  }
  FURN.curtain = (F, f) => {
    const w = f.w, h = f.h;
    B(F, 0, 0, CH - 4, w * 2 + 30, 6, 4, M.plaster_keep, 0.5, false);
    drape(F, 0, 2, w, CH - 6, M.drape, 4.5, Math.round(w / 12));
    drape(F, (f.x > 600 ? -1 : 1) * (w * 0.75), -3, w * 0.9, CH - 6, M.sheer, 2.6, Math.round(w / 10));
  };
  FURN.mirror = (F, f) => {
    B(F, 0, 0, f.elev - 1, f.w + 3, 2, f.h + 2, M.oak_honey, 0.3);
    Plane(F, 0, 1.1, f.elev, f.w - 1, f.h - 1, M.mirror);
    B(F, 0, 1, 0, f.w + 3, 4, f.elev, M.oak_honey, 0.3);
  };
  // 玄关柜（精装保留）：通顶木柜 + 灯带壁龛 + 悬空底
  FURN.cabinet = (F, f) => {
    const w = f.w, d = f.d, H2 = CH - 1;
    B(F, 0, 0, 18, w, d, 82, M.oak_light, 0.4);
    B(F, 0, 0, 100, w, d, 3, M.oak_light, 0.4);
    B(F, 0, -d / 2 + 2, 103, w, 4, 40, M.oak_pale, 0.2);
    B(F, 0, 0, 143, w, d, H2 - 143, M.oak_light, 0.4);
    const nd = 4;
    for (let k = 0; k < nd; k++) {
      const x = -w / 2 + w / nd * (k + 0.5);
      B(F, x, d / 2 + 0.4, 19, w / nd - 0.8, 1, 80, M.oak_pale, 0.2);
      B(F, x, d / 2 + 0.4, 144, w / nd - 0.8, 1, H2 - 145, M.oak_pale, 0.2);
    }
    add(new THREE.BoxGeometry(w / 100, 0.008, 0.012), M.led, F.clone().multiply(T3(0, d / 2 - 4, 142.4)), false);
    add(new THREE.BoxGeometry(w / 100, 0.008, 0.012), M.led, F.clone().multiply(T3(0, d / 2 - 4, 17.6)), false);
    Lathe(F, -w * 0.3, -2, 103, [[0, 0], [9, 0], [10, 2], [9, 4], [0, 3]], M.ceramic_white, 28);
    Lathe(F, w * 0.22, -4, 103, [[0, 0], [3.5, 0], [4, 8], [1.5, 13], [1.2, 16], [0, 16]], M.ceramic_white, 20);
    Lathe(F, w * 0.3, -4, 103, [[0, 0], [3, 0], [3.4, 7], [1.2, 11], [1, 13], [0, 13]], M.ceramic_white, 20);
    const g = new THREE.PlaneGeometry(w / 100, 0.36).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, M.ceilglow); mesh.applyMatrix4(F.clone().multiply(T3(0, d / 2 + 10, 0.6))); root.add(mesh); DYN.ceilGlows.push(mesh);
    collide(F, 0, 0, w, d);
  };
  // 厨房橱柜：深木门板 + 石英台面 + 吊柜 + 柜下灯带
  FURN.counter = (F, f) => {
    const w = f.w, d = f.d, h = f.h;
    B(F, 0, -2, 0, w, d - 6, 10, M.plinth_dark, 0.2);
    B(F, 0, -1, 10, w, d - 2, h - 14, M.wood_kitchen, 0.4);
    const nd = Math.round(w / 45);
    for (let k = 0; k < nd; k++) {
      const x = -w / 2 + w / nd * (k + 0.5);
      if (f.feature === 'cooktop' && k === 1) { B(F, x, d / 2 - 0.4, 14, w / nd - 1, 1, h - 22, M.glass_black, 0.3); continue; }
      B(F, x, d / 2 - 0.4, 12, w / nd - 0.8, 1, h - 18, M.wood_kitchen, 0.2);
    }
    B(F, 0, 0, h - 4, w + 2, d + 2, 4, M.stone_counter, 0.4);
    // 吊柜 + 灯带
    B(F, 0, -d / 2 + 18, 150, w, 34, 72, M.wood_kitchen, 0.4);
    for (let k = 0; k < nd; k++) B(F, -w / 2 + w / nd * (k + 0.5), -d / 2 + 35.4, 151, w / nd - 0.8, 1, 70, M.wood_kitchen, 0.2);
    add(new THREE.BoxGeometry((w - 4) / 100, 0.008, 0.012), M.led, F.clone().multiply(T3(0, -d / 2 + 30, 149.4)), false);
    const wg = new THREE.PlaneGeometry(w / 100, 0.6); wg.translate(0, -0.3, 0);
    const wm = new THREE.Mesh(wg, M.wash_cool); wm.applyMatrix4(F.clone().multiply(T3(0, -d / 2 + 0.6, 149))); wm.renderOrder = 2; root.add(wm); DYN.washes.push(wm);
    if (f.feature === 'cooktop') {
      B(F, -w * 0.12, 0, h, 60, 46, 0.8, M.glass_black, 0.4);
      [[-14, -10, 9], [14, -10, 7], [0, 10, 8]].forEach(([x, y, r]) => { Cy(F, -w * 0.12 + x, y, h + 0.8, r, 1, M.iron, 24); });
      Cy(F, -w * 0.12 - 14, -10, h + 1.8, 13, 7, M.steel, 28);
      Cy(F, -w * 0.12 + 14, 2, h + 1.8, 11, 9, M.steel, 28);
      // 油烟机
      B(F, -w * 0.12, -d / 2 + 24, 140, 80, 46, 8, M.plinth_dark, 1);
      // 调料瓶
      [[w * 0.3, M.glass_black, 24], [w * 0.33, M.ceramic_clay, 20], [w * 0.36, M.glass_clear, 26], [w * 0.39, M.ceramic_white, 14]].forEach(([x, mat, hh]) =>
        Lathe(F, x, -d / 2 + 10, h, [[0, 0], [3, 0], [3, hh * 0.65], [1.2, hh * 0.85], [1.2, hh], [0, hh]], mat, 16));
      B(F, w * 0.2, -4, h, 34, 24, 1.5, M.walnut, 0.4, true, 6);
    }
    if (f.feature === 'sink') {
      B(F, w * 0.05, 4, h - 0.6, 78, 44, 1.2, M.sink_black, 1);
      B(F, w * 0.05 - 18, 4, h - 0.2, 36, 36, 0.6, M.plinth_dark, 0.6, false);
      B(F, w * 0.05 + 18, 4, h - 0.2, 36, 36, 0.6, M.plinth_dark, 0.6, false);
      Tube(F, [[w * 0.05, -d / 2 + 8, h], [w * 0.05, -d / 2 + 8, h + 30], [w * 0.05, -d / 2 + 15, h + 36], [w * 0.05, -d / 2 + 24, h + 26]], 1.2, M.black_metal, 20);
      // 挂杆 + 咖啡机 + 电饭煲
      Tube(F, [[-w * 0.4, -d / 2 + 2, 118], [-w * 0.05, -d / 2 + 2, 118]], 0.6, M.steel, 4);
      for (let k = 0; k < 5; k++) Cy(F, -w * 0.38 + k * 8, -d / 2 + 4, 105, 2.2, 8, k % 2 ? M.steel : M.ceramic_white, 12);
      B(F, -w * 0.38, -6, h, 18, 24, 30, M.steel, 2);
      B(F, w * 0.38, -2, h, 26, 26, 18, M.plastic_white, 6);
      window.NATIVE_PLANTS.build('eucalyptus', F.clone().multiply(T3(w * 0.25, -d / 2 + 12, h)), 0.48, add, M, 51, M.stone_grey);
    }
    collide(F, 0, 0, w, d);
  };
  FURN.fridge = (F, f) => {
    const w = f.w, d = f.d, h = f.h;
    B(F, 0, 0, 0, w, d, h, M.fridge_black, 1.2);
    B(F, 0, d / 2 + 0.2, h * 0.38, 1, 1.2, h * 0.6, M.plinth_dark, 0.2);
    B(F, 0, d / 2 + 0.2, h * 0.36, w, 0.6, 0.8, M.plinth_dark, 0.2);
    [-1, 1].forEach(s => B(F, s * 3.5, d / 2 + 1.8, h * 0.5, 1.6, 2.2, 42, M.steel, 0.6));
    Plane(F, w * 0.22, d / 2 + 0.8, h * 0.66, 7, 10, M.panel_glow);
    // 冰箱贴
    for (let k = 0; k < 6; k++) B(F, -w * 0.3 + (k % 3) * 6, d / 2 + 0.8, h * 0.6 + Math.floor(k / 3) * 7, 3.6, 0.6, 3.6, M.books[k], 0.4, false);
    // 两侧/顶部高柜
    B(F, 0, 0, h + 1, w + 4, d, CH - h - 1, M.wood_kitchen, 0.4);
    collide(F, 0, 0, w, d);
  };
  FURN.lounge = (F, f) => {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => Tube(F, [[sx * 26, sy * 24, 0], [sx * 27, sy * 24, 32]], 1.2, M.oak_honey, 4));
    B(F, 0, 0, 30, 60, 56, 4, M.oak_honey, 1);
    B(F, 0, 4, 34, 56, 48, 10, M.linen_oat, 4);
    const P = F.clone().multiply(T3(0, -24, 38)).multiply(m4().makeRotationX(-0.28));
    add(rbox(56, 10, 46, 4), M.linen_oat, P.multiply(T3(0, 0, 23)), true);
    [-1, 1].forEach(s => B(F, s * 29, 0, 48, 4, 52, 3, M.oak_honey, 1));
    Cy(F, 50, 8, 0, 18, 46, M.oak_honey, 28);
    window.NATIVE_PLANTS.build('twigs', F.clone().multiply(T3(50, 8, 46)), 0.4, add, M, 81, M.ceramic_clay);
    contact(F, 0, 0, 80, 70, 0.4);
    collide(F, 0, 0, 62, 58);
  };
  FURN.watersys = (F, f) => {
    B(F, 0, 0, 0, f.w, f.d, f.h, M.plastic_white, 1.2);
    [-1, 0, 1].forEach(k => { Cy(F, k * 28, 2, 10, 9, f.h - 40, M.steel, 24); });
    Plane(F, 0, f.d / 2 + 0.6, f.h - 30, 18, 10, M.panel_glow);
    collide(F, 0, 0, f.w, f.d);
  };
  FURN.rug = (F, f) => {
    const g = new THREE.BoxGeometry(f.w / 100, 0.008, f.d / 100);
    const mesh = new THREE.Mesh(g, f.y > 560 && f.x < 500 ? M.rug_jute2 : M.rug_jute);
    mesh.applyMatrix4(F.clone().multiply(T3(0, 0, 0.4))); mesh.receiveShadow = true; root.add(mesh);
  };
  // 飘窗坐垫 + 抱枕 + 托盘茶具
  FURN.baycushion = (F, f) => {
    const bay = (DYN.bays || []).find(b => b.room === f.room);
    if (!bay) return;
    // 坐垫范围：玻璃内 2cm → 室内墙面内 2cm；局部 +y（正面）朝向室内
    const G = bay.F.clone().multiply(m4().makeTranslation(0, 0, -bay.inSide * (bay.t / 2 + bay.dep / 2) / 100 + bay.inSide * 0.115));
    const Gf = G.clone().multiply(m4().makeRotationY(bay.inSide > 0 ? 0 : Math.PI));
    B(Gf, 0, 0, bay.sill, bay.Wd - 8, bay.dep + bay.t - 7, 7, M.linen_white, 3);
    [[-bay.Wd / 2 + 26, M.linen_grey], [-bay.Wd / 2 + 52, M.linen_sand]].forEach(([x, mat], i) => {
      const P = Gf.clone().multiply(T3(x, -6, bay.sill + 24)).multiply(m4().makeRotationX(0.22)).multiply(m4().makeRotationY((i ? 14 : -10) * DEG));
      add(rbox(44, 14, 34, 6), mat, P, true);
    });
    B(Gf, bay.Wd * 0.2, 0, bay.sill + 7, 34, 22, 2, M.walnut, 0.5);
    Lathe(Gf, bay.Wd * 0.2 - 6, 0, bay.sill + 9, [[0, 0], [3.5, 0], [5, 4], [3.2, 8], [0, 8]], M.ceramic_white, 20);
    Cy(Gf, bay.Wd * 0.2 + 6, 3, bay.sill + 9, 2.8, 4, M.ceramic_white, 16);
  };
  FURN.beanbag = (F, f) => {
    const r = f.r;
    const prof = []; for (let k = 0; k <= 14; k++) { const a = -Math.PI / 2 + Math.PI * k / 14; prof.push([Math.cos(a) * r * (1 + 0.08 * Math.sin(k)), (Math.sin(a) + 1) * r * 0.42]); }
    Lathe(F, 0, 0, 0, prof, M.boucle_cream, 36);
    Sp(F, -r * 0.2, -r * 0.3, r * 0.72, r * 0.42, 1.2, 0.5, 0.9, M.boucle_cream);
    B(F, r * 0.6, r * 0.2, r * 0.8, 50, 40, 3, M.linen_grey, 1, true, 20);
    contact(F, 0, 0, r * 2.4, r * 2.4, 0.42);
    collide(F, 0, 0, r * 1.8, r * 1.8);
  };
  FURN.desk = (F, f) => {
    const w = f.w, d = f.d, h = f.h, rl = f.returnLen || 0;
    B(F, 0, 0, h - 4, w, d, 4, M.ash, 0.6);
    B(F, -w / 2 + 3, 0, 0, 4, d - 4, h - 4, M.ash, 0.6);
    B(F, w / 2 - 3, 0, 0, 4, d - 4, h - 4, M.ash, 0.6);
    if (rl) { B(F, w / 2 - d / 2, d / 2 + rl / 2 - d / 2 + d / 2, h - 4, d, rl, 4, M.ash, 0.6); B(F, w / 2 - d / 2, rl - 6, 0, d - 4, 4, h - 4, M.ash, 0.6); }
    // 层板书架：靠西墙（不挡北窗），3 层 + 书 + 小摆件
    const sx = -w / 2 - 4 + 13;
    [h + 18, h + 55, h + 92].forEach((z, row) => {
      B(F, sx, 80, z, 25, 170, 2.5, M.ash, 0.4);
      let y = 0;
      while (y < 160) {
        const bw = 2.5 + (Math.sin(y * 1.7 + row) + 1) * 1.6, bh = 20 + (Math.cos(y * 0.9 + row) + 1) * 5;
        if (Math.sin(y * 0.37 + row * 2) > 0.7) { if (row !== 1) Lathe(F, sx, y + 7, z + 2.5, [[0, 0], [4, 0], [5, 6], [3, 13], [0, 13]], [M.ceramic_sage, M.ceramic_clay, M.ceramic][row], 18); y += 16; continue; }
        B(F, sx, y, z + 2.5, 18, bw, bh, M.books[Math.floor(Math.abs(y * 3 + row)) % M.books.length], 0.2, true);
        y += bw + 0.4;
      }
    });
    // 显示器 + 挂灯 + 台灯 + 笔记本
    B(F, -w * 0.15, -d / 2 + 18, h, 22, 18, 1.2, M.black_metal, 0.4);
    Cy(F, -w * 0.15, -d / 2 + 18, h + 1.2, 1.4, 14, M.black_metal, 10);
    B(F, -w * 0.15, -d / 2 + 16, h + 14, 62, 2.4, 37, M.plastic_black, 0.8);
    Plane(F, -w * 0.15, -d / 2 + 17.3, h + 15.5, 59, 34, M.screen);
    B(F, -w * 0.15, -d / 2 + 15, h + 52, 40, 3, 2.4, M.black_metal, 1);
    B(F, w * 0.18, 4, h, 32, 22, 1.4, M.steel, 0.6, true, -8);
    Lathe(F, w * 0.35, -d / 2 + 14, h, [[0, 0], [6, 0], [6, 1], [1, 2], [1, 30], [0, 30]], M.brass, 20);
    Lathe(F, w * 0.35, -d / 2 + 14, h + 28, [[11, 0], [10.5, 0.6], [4, 10], [3.6, 10.3]], M.shade, 32, false);
    collide(F, 0, 0, w, d); if (rl) collide(F, w / 2 - d / 2, rl / 2, d, rl);
  };
  FURN.chair = (F, f) => {
    // 人体工学椅：五星脚 + 网面
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; Tube(F, [[0, 0, 8], [Math.cos(a) * 30, Math.sin(a) * 30, 5]], 1.2, M.black_metal, 4); Sp(F, Math.cos(a) * 30, Math.sin(a) * 30, 3, 3, 1, 1, 1, M.plastic_black); }
    Cy(F, 0, 0, 8, 2.2, 36, M.chrome, 12);
    B(F, 0, 2, 44, 50, 48, 7, M.mesh_dark, 3);
    const P = F.clone().multiply(T3(0, -24, 50)).multiply(m4().makeRotationX(-0.18));
    add(rbox(46, 4, 56, 3), M.mesh_dark, P.multiply(T3(0, 0, 28)), true);
    [-1, 1].forEach(s => B(F, s * 27, 0, 60, 4, 28, 2.6, M.plastic_black, 1));
    contact(F, 0, 0, 70, 70, 0.35);
  };
  FURN.nightstand = (F, f) => {
    B(F, 0, 0, 0, f.w, f.d, f.h, M.oak_light, 0.8);
    B(F, 0, f.d / 2 + 0.3, f.h * 0.52, f.w - 3, 1, f.h * 0.4, M.oak_pale, 0.3);
    B(F, 0, f.d / 2 + 0.3, 3, f.w - 3, 1, f.h * 0.42, M.oak_pale, 0.3);
    // 蘑菇台灯 + 干枝花瓶
    Lathe(F, 0, -4, f.h, [[0, 0], [5, 0], [5, 1], [1.4, 2], [1.4, 18], [0, 18]], M.ceramic_white, 20);
    const sh = []; for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 * k / 10; sh.push([Math.cos(a) * 13, Math.sin(a) * 9]); }
    Lathe(F, 0, -4, f.h + 17, [[13, 0]].concat(sh), M.shade, 32, false);
    DYN.lights.push({ kind: 'bed', x: f.x, y: f.y, z: f.h + 22, room: f.room });
  };
  FURN.bed = (F, f) => {
    const w = f.w, d = f.d;
    B(F, 0, 0, 0, w - 6, d - 6, 8, M.plinth_dark, 0.5);
    B(F, 0, 0, 8, w, d, 22, M.oak_light, 1.2);
    B(F, 0, 4, 30, w - 6, d - 12, 22, M.linen_white, 5);
    // 被子：起伏面
    const g = new THREE.PlaneGeometry((w + 6) / 100, (d * 0.72) / 100, 24, 18);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.025 + Math.sin(x * 18 + y * 9) * 0.006 + Math.cos(y * 26) * 0.004); }
    g.rotateX(-Math.PI / 2); g.computeVertexNormals();
    add(g, M.linen_white, F.clone().multiply(T3(0, d * 0.13, 51)), true);
    B(F, 0, d * 0.3, 52, w + 2, d * 0.22, 2.4, M.linen_oat, 1.1);
    [-1, 1].forEach(s => {
      const P = F.clone().multiply(T3(s * w * 0.24, -d / 2 + 22, 56)).multiply(m4().makeRotationX(-0.5));
      add(rbox(w * 0.42, 14, 34, 7), M.linen_white, P, true);
      const Q = F.clone().multiply(T3(s * w * 0.2, -d / 2 + 36, 56)).multiply(m4().makeRotationX(-0.35));
      add(rbox(w * 0.3, 11, 26, 5), s > 0 ? M.linen_grey : M.linen_sand, Q, true);
    });
    // 木饰面床头 + 上方灯带（主卧参考图）
    B(F, 0, -d / 2 - 3, 0, w + 30, 5, 110, M.oak_light, 0.6);
    add(new THREE.BoxGeometry((w + 26) / 100, 0.008, 0.01), M.led, F.clone().multiply(T3(0, -d / 2 - 0.2, 110.4)), false);
    const wg = new THREE.PlaneGeometry((w + 26) / 100, 0.9); wg.translate(0, 0.45, 0); { const uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
    const wm = new THREE.Mesh(wg, M.wash_cool); wm.applyMatrix4(F.clone().multiply(T3(0, -d / 2 - 5.4, 110))); wm.renderOrder = 2; root.add(wm); DYN.washes.push(wm);
    Plane(F, w * 0.35, -d / 2 - 0.4, 80, 9, 6, M.panel_glow);
    contact(F, 0, 0, w + 20, d + 20, 0.5);
    collide(F, 0, 0, w, d);
  };
  FURN.wardrobe = (F, f) => {
    const w = f.w, d = f.d, h = Math.min(f.h, CH - 1);
    B(F, 0, 0, 0, w, d, h, M.oak_light, 0.4);
    const nd = Math.max(2, Math.round(w / 60));
    for (let k = 0; k < nd; k++) {
      const x = -w / 2 + w / nd * (k + 0.5);
      B(F, x, d / 2 + 0.4, 1, w / nd - 0.6, 1, h - 2, M.oak_pale, 0.2);
      B(F, x + (k % 2 ? -1 : 1) * (w / nd / 2 - 4), d / 2 + 1.4, 30, 1.2, 1.2, 140, M.black_metal, 0.3);
    }
    if (f.back === 'slats') for (let k = 0; k < Math.floor(w / 6); k++) B(F, -w / 2 + 3 + k * 6, -d / 2 - 1.5, 0, 3.6, 3, h, M.oak_honey, 0.4);
    collide(F, 0, 0, w, d);
  };
  FURN.glasscabinet = (F, f) => {
    const w = f.w, d = f.d, h = Math.min(f.h, CH - 1);
    B(F, 0, 0, 0, w, d, h, M.oak_light, 0.4);
    const nd = 4;
    for (let k = 0; k < nd; k++) {
      const x = -w / 2 + w / nd * (k + 0.5);
      B(F, x, -d / 2 + 3, 2, w / nd - 3, 2, h - 4, M.oak_pale, 0.2);
      for (let s = 1; s < 5; s++) {
        const z = s * h / 5;
        B(F, x, 0, z, w / nd - 4, d - 6, 2, M.glass_clear, 0.2, false);
        add(new THREE.BoxGeometry((w / nd - 6) / 100, 0.006, 0.01), M.led, F.clone().multiply(T3(x, d / 2 - 8, z - 0.6)), false);
        if (k < 2) for (let q = 0; q < 5; q++) B(F, x - 18 + q * 9, -4, z + 2, 6, 20, 24 + (q % 3) * 4, M.books[(q + s + k) % 9], 0.3);
        else for (let q = 0; q < 3; q++) Lathe(F, x - 14 + q * 14, -2, z + 2, [[0, 0], [4, 0], [5, 6], [3.4, 12 + q * 3], [0, 12 + q * 3]], [M.ceramic, M.ceramic_sage, M.ceramic_clay][q], 20);
      }
      B(F, x, d / 2 + 0.6, 2, w / nd - 1.5, 0.8, h - 4, M.glass_clear, 0.2, false);
      [-1, 1].forEach(sx => B(F, x + sx * (w / nd / 2 - 1.5), d / 2 + 0.6, 2, 1.4, 1.4, h - 4, M.alu_win, 0.2));
    }
    collide(F, 0, 0, w, d);
  };
  FURN.bigtable = (F, f) => {
    const w = f.w, d = f.d, h = f.h;
    B(F, 0, 0, h - 4, w, d, 4, M.oak_honey, 0.6);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => B(F, sx * (w / 2 - 6), sy * (d / 2 - 6), 0, 5, 5, h - 4, M.walnut, 0.8));
    // 桌上超白玻璃展示柜
    B(F, 0, -d / 2 + 14, h, w - 20, 26, 46, M.glass_clear, 0.4, false);
    [-1, 1].forEach(s => B(F, s * (w / 2 - 11), -d / 2 + 14, h, 1.4, 26, 46, M.alu_win, 0.2));
    B(F, 0, -d / 2 + 14, h + 46, w - 20, 26, 1.4, M.alu_win, 0.2);
    add(new THREE.BoxGeometry((w - 24) / 100, 0.006, 0.01), M.led, F.clone().multiply(T3(0, -d / 2 + 20, h + 45)), false);
    for (let q = 0; q < 7; q++) {
      const x = -w / 2 + 24 + q * (w - 48) / 6;
      if (q % 2) Lathe(F, x, -d / 2 + 14, h + 1, [[0, 0], [3, 0], [3.4, 2], [2.4, 8], [3, 12], [0, 14]], [M.ceramic_clay, M.ceramic_sage, M.brass][q % 3], 18);
      else B(F, x, -d / 2 + 14, h + 1, 7, 7, 10 + q, [M.books[q], M.ceramic_white, M.books[q + 1]][q % 3], 1.2);
    }
    // 桌游盒 + 手工垫
    B(F, w * 0.15, 10, h, 30, 30, 6, M.books[5], 0.6, true, 10);
    B(F, -w * 0.18, 8, h, 45, 30, 0.4, M.mat_sage, 0.2, false);
    [-1, 1].forEach(s => caneChair(F.clone().multiply(T3(s * 45, d / 2 + 30, 0)).multiply(m4().makeRotationY(Math.PI))));
    contact(F, 0, 0, w + 20, d + 80, 0.32);
    collide(F, 0, 0, w, d);
  };
  FURN.yogamat = (F, f) => {
    B(F, 0, 0, 0, f.w, f.d, 0.6, M.mat_sage, 0.3, false);
  };
  FURN.dumbbell = (F, f) => {
    B(F, 0, 0, 0, 50, 28, 4, M.black_metal, 0.6);
    [-1, 1].forEach(s => B(F, s * 22, 0, 4, 4, 24, 70, M.black_metal, 0.6));
    [24, 48].forEach(z => { B(F, 0, 0, z, 48, 26, 2, M.black_metal, 0.4); [-14, 0, 14].forEach(x => { Cy(F, x, -4, z + 2, 3.2, 3, M.iron, 16); Cy(F, x, 4, z + 2, 3.2, 3, M.iron, 16); }); });
    collide(F, 0, 0, 50, 28);
  };
  FURN.shower = (F, f) => {
    const w = f.w, d = f.d;
    // 玻璃隔断 + 黑框 + 顶喷 + 壁龛
    B(F, 0, d / 2, 0, w, 1, 200, M.glass_shower, 0.1, false);
    B(F, 0, d / 2, 199, w, 3, 3, M.black_metal, 0.3);
    [-1, 1].forEach(s => B(F, s * (w / 2 - 1), d / 2, 0, 3, 3, 200, M.black_metal, 0.3));
    B(F, 0, d / 2 - 2, 0, w, 6, 2, M.lime_floor, 0.4);
    Tube(F, [[w * 0.2, -d / 2 + 2, 110], [w * 0.2, -d / 2 + 2, 200], [w * 0.2, -d / 2 + 22, 205]], 1, M.brass, 16);
    Cy(F, w * 0.2, -d / 2 + 26, 200, 11, 1.2, M.brass, 32);
    Cy(F, w * 0.2, -d / 2 + 2, 100, 3.5, 8, M.brass, 16);
    B(F, -w / 2 + 9, -d / 2 + 30, 105, 16, 22, 2, M.stone_sill, 0.4);
    [[-8, 20], [0, 16], [8, 18]].forEach(([y, hh], i) => Lathe(F, -w / 2 + 9, -d / 2 + 30 + y, 107, [[0, 0], [3, 0], [3, hh * 0.7], [1, hh * 0.85], [1, hh], [0, hh]], i === 1 ? M.ceramic_white : M.glass_black, 14));
    B(F, 0, d / 2 - 12, 130, 4, 22, 1.4, M.black_metal, 0.3);
    B(F, 0, d / 2 - 12, 92, 2, 18, 38, M.linen_white, 1);
    COLL.segs.push([...pt(F, -w / 2, d / 2), ...pt(F, w / 2, d / 2), 0, 200]);
  };
  function pt(F, x, y) { const v = new THREE.Vector3(x / 100, 0, y / 100).applyMatrix4(F); return [v.x, v.z]; }
  FURN.toilet = (F, f) => {
    // 壁挂智能马桶
    const prof = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; prof.push([Math.sin(a) * 18 + 0.1, 40 - Math.cos(a) * 0.1 - k * 0.1]); }
    B(F, 0, -26, 0, 40, 14, 100, M.ceramic_white, 2);
    const sh = new THREE.Shape(); sh.absellipse(0, 0, 0.19, 0.27, 0, Math.PI * 2);
    const bowl = new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 4, curveSegments: 40 });
    bowl.rotateX(-Math.PI / 2);
    add(bowl, M.ceramic_white, F.clone().multiply(T3(0, 6, 16)), true);
    const lid = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 40 });
    lid.rotateX(-Math.PI / 2);
    add(lid, M.ceramic_white, F.clone().multiply(T3(0, 6, 44)), true);
    B(F, 0, -28, 102, 18, 2, 10, M.chrome, 0.6);
    contact(F, 0, 0, 50, 70, 0.35);
    collide(F, 0, 0, 40, 60);
  };
  FURN.vanity = (F, f) => {
    const w = f.w, d = f.d, h = f.h;
    // 悬挂木柜 + 石材台盆（参考插画）
    B(F, 0, 0, h - 42, w, d, 30, M.oak_light, 1);
    B(F, 0, d / 2 + 0.4, h - 41, w - 2, 1, 28, M.oak_pale, 0.6);
    B(F, 0, 0, h - 12, w + 2, d + 2, 12, M.stone_counter, 1);
    const basin = (bx, rw) => {
      const sh = new THREE.Shape(); sh.absellipse(0, 0, (w * rw) / 100, d * 0.3 / 100, 0, Math.PI * 2);
      add(new THREE.ShapeGeometry(sh, 32).rotateX(-Math.PI / 2), M.ceramic_white, F.clone().multiply(T3(bx, 3, h + 0.2)), false);
      Tube(F, [[bx, -d / 2 + 3, h + 22], [bx, -d / 2 + 13, h + 22]], 1, M.brass, 6);
      Cy(F, bx + 8, -d / 2 + 2, h + 20, 2.2, 3.6, M.brass, 16);
    };
    if (f.long) {
      // 拉通长悬浮柜：三扇抽屉面
      for (let k = 0; k < 3; k++) B(F, -w / 2 + w / 6 + k * w / 3, -d / 2 - 0.4, h - 40, w / 3 - 1, 0.9, 26, M.oak_pale, 0.4);
      basin(-w * 0.27, 0.14); basin(w * 0.27, 0.14);
      // 长背光镜（贴南墙，镜面朝北）+ 顶/侧灯带
      const mg2 = new THREE.PlaneGeometry((w - 14) / 100, 0.84);
      add(mg2, M.mirror, F.clone().multiply(T3(0, d / 2 - 1.5, h + 42)).multiply(m4().makeRotationY(Math.PI)), false);
      add(new THREE.BoxGeometry((w - 8) / 100, 0.012, 0.012), M.led, F.clone().multiply(T3(0, d / 2 - 2.2, h + 86)), false);
      B(F, -w / 2 + 6, d / 2 - 2.2, h + 4, 1.2, 1, 78, M.led, 0, false);
      B(F, w / 2 - 6, d / 2 - 2.2, h + 4, 1.2, 1, 78, M.led, 0, false);
      // 中央化妆品托盘、干枝花瓶
      B(F, 0, -3, h + 0.5, 32, 12, 2.4, M.walnut, 0.4);
      [[-8, M.glass_black, 13], [0, M.ceramic_white, 11], [9, M.ceramic_clay, 15]].forEach(([x, mat, hh]) => Lathe(F, x, -3, h + 3, [[0, 0], [2.6, 0], [2.6, hh * 0.75], [0.8, hh * 0.85], [0.8, hh], [0, hh]], mat, 14));
      B(F, w / 2 + 6, -d / 2 + 8, h + 10, 2, 22, 48, M.linen_sand, 1);
      B(F, -w / 2 - 6, -d / 2 + 8, h + 10, 2, 22, 48, M.linen_white, 1);
    } else {
      basin(0, 0.28);
      if (f.room === 'mbath') {
        const g = new THREE.CircleGeometry(0.36, 48);
        add(g, M.mirror, F.clone().multiply(T3(0, -d / 2 + 1.2, h + 75)), false);
        const hm = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.44, 48), M.halo); hm.applyMatrix4(F.clone().multiply(T3(0, -d / 2 + 0.6, h + 75))); root.add(hm); DYN.halos.push(hm);
      } else {
        Plane(F, 0, -d / 2 + 1.2, h + 30, w - 10, 70, M.mirror);
        add(new THREE.BoxGeometry((w - 10) / 100, 0.008, 0.01), M.led, F.clone().multiply(T3(0, -d / 2 + 1.6, h + 29)), false);
      }
      B(F, -w * 0.32, -4, h, 18, 10, 1.4, M.walnut, 0.4);
      [[-w * 0.36, M.glass_black, 15], [-w * 0.28, M.ceramic_white, 12]].forEach(([x, mat, hh]) => Lathe(F, x, -4, h + 1.4, [[0, 0], [2.6, 0], [2.6, hh * 0.75], [0.8, hh * 0.85], [0.8, hh], [0, hh]], mat, 14));
      window.NATIVE_PLANTS.build('bush', F.clone().multiply(T3(w * 0.36, -6, h)), 0.26, add, M, 61, M.ceramic_white);
      B(F, w / 2 + 6, -d / 2 + 8, h + 10, 2, 22, 48, M.linen_sand, 1);
    }
    collide(F, 0, 0, w, d);
  };

  // ---------------------------------------------------------------- 植物
  function plants() {
    const pick = f => {
      if (f.name === '琴叶榕') return ['ficus', 1.75];
      if (f.room === 'balcony' && f.x > 600) return ['olive', 1.7];
      if (f.room === 'balcony') return ['grass', 1.0];
      if (f.room === 'living') return ['rubber', 0.95];
      if (f.room === 'master') return ['olive', 1.4];
      return ['bush', 0.7];
    };
    H.furniture.filter(f => f.kind === 'plant').forEach((f, i) => {
      const [kind, h] = pick(f);
      const F = frame(f.x, f.y, 0);
      window.NATIVE_PLANTS.build(kind, F, h * (f.room === 'foyer' ? 0.8 : 1), add, M, 100 + i * 17);
      contact(F, 0, 0, 52, 52, 0.4);
      COLL.boxes.push([f.x / 100 - 0.2, f.y / 100 - 0.2, f.x / 100 + 0.2, f.y / 100 + 0.2]);
    });
    // 阳台花园：参考插画（橄榄树 + 草本 + 陶盆），以及客厅额外大绿植
    [[180, 860, 'olive', 1.5], [430, 880, 'grass', 0.9], [470, 880, 'bush', 0.6], [640, 985, 'grass', 0.9]].forEach(([x, y, k, h], i) => {
      const F = frame(x, y, 0); window.NATIVE_PLANTS.build(k, F, h, add, M, 300 + i * 13, M.terracotta); contact(F, 0, 0, 50, 50, 0.4);
    });
    const F2 = frame(540, 760 - 26, 0); window.NATIVE_PLANTS.build('grass', F2, 0.9, add, M, 401);
  }

  // ---------------------------------------------------------------- 主卧额外：参考图中的主卫、飘窗、衣柜已在数据里
  function extras() {
    // 客厅：墙上搁板（插画）、挂钟（全景）、书法挂画
    const liv = frame(560, 340, 0);
    B(liv, 0, 9, 160, 120, 18, 3, M.oak_honey, 0.5);
    [[-45, M.ceramic, 14], [-32, M.ceramic_sand, 18], [-18, M.ceramic_white, 10], [20, M.ceramic_clay, 9]].forEach(([x, mat, hh]) => Lathe(liv, x, 9, 163, [[0, 0], [3.4, 0], [4.4, hh * 0.5], [2.6, hh], [0, hh]], mat, 20));
    B(liv, 40, 6, 163, 22, 2, 28, M.walnut, 0.3); Plane(liv, 40, 7.2, 165, 18, 24, M.art_botanical);
    // 生活书房、客卧的挂画
    const st = frame(1190, 322, 180);
    // 客卧床头挂画
    const gu = frame(567, 90, 270);
    B(gu, 0, -1, 130, 52, 3, 70, M.walnut, 0.3); Plane(gu, 0, 0.6, 133, 46, 64, M.art_botanical);
    // 主卧：床头吊灯两盏
    // 阳台：外景小桌
    const bal = frame(760, 950, 0);
    Cy(bal, 0, 0, 0, 1.6, 50, M.black_metal, 10);
    Cy(bal, 0, 0, 50, 26, 2.4, M.oak_honey, 36);
    Lathe(bal, 6, 0, 52.4, [[0, 0], [3, 0], [4, 4], [3, 8], [0, 8]], M.ceramic_white, 18);
  }

  // ---------------------------------------------------------------- 房间标签（俯瞰时显示）
  function labels() {
    H.rooms.forEach(r => {
      const [cx, cy] = polyCenter(r.poly);
      DYN.labels.push({ id: r.id, name: r.name, area: r.area, x: cx / 100, z: cy / 100 });
    });
  }

  function build(sceneRef, mats) {
    scene = sceneRef; M = mats.M; T = mats.T;
    root = new THREE.Group(); root.name = 'home'; scene.add(root);
    buildFloorsCeilings();
    buildWalls();
    buildTracks();
    H.furniture.forEach(f => { if (f.kind !== 'plant' && FURN[f.kind]) FURN[f.kind](frame(f.x, f.y, f.rot || 0), f); });
    plants();
    extras();
    flush();
    labels();
    return { rooms, DYN, COLL, root, CH, WH, roomAt, polyCenter };
  }

  window.NATIVE_SCENE = { build };
})();
