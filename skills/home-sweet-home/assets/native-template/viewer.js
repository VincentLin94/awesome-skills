/* 查看器：两种看法 + 三档氛围
 *  - 人视角：像网站 360° 全景一样原地拖拽环视、滚轮变焦；WASD/方向键走动；双击地面走过去；墙和大件家具会挡住
 *  - 俯瞰：剖切娃娃屋，隐藏天花、墙体切到 1.2m，点房间进入
 *  - 黄昏（默认，对齐插画）/ 日间 / 夜晚；PMREM 反射、软阴影、灯槽洗墙光
 */
(function () {
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  const DPR = Math.min(devicePixelRatio, 1.6);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.physicallyCorrectLights = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
  scene.add(camera);

  const mats = window.NATIVE_MATS.build();
  const M = mats.M;
  const S = window.NATIVE_SCENE.build(scene, mats);
  const H = window.HOME, R = S.rooms;

  // ---------------------------------------------------------------- 天空 + 环境
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false, fog: false }));
  skyMesh.position.set(7.6, -9, 5); scene.add(skyMesh);
  const planBg = new THREE.Color(0xe9e1d6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environment = roomEnv;

  // ---------------------------------------------------------------- 灯光
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4;
  sun.target.position.set(7.6, 0, 5);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xdfe8ee, 0x8a7258, 0.3); scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xfff1e2, 0.1); scene.add(ambient);

  // 室内灯：每类灯一组；只在对应房间可见时启用（控制光源总数，保持流畅）
  const interior = [];
  function addPoint(x, y, z, color, dist, kind, room) {
    const l = new THREE.PointLight(color, 0, dist, 2);
    l.position.set(x / 100, z / 100, y / 100); l.userData = { kind, room }; scene.add(l); interior.push(l); return l;
  }
  const roomOf = (x, y) => { const r = S.roomAt(x, y); return r ? r.id : null; };
  S.DYN.lights.forEach(L => {
    if (L.kind === 'spot') {
      const s = new THREE.SpotLight(0xffd2a0, 0, 7, 24 * Math.PI / 180, 0.55, 2);
      s.position.set(L.x / 100, L.z / 100, L.y / 100);
      s.target.position.set(L.tx / 100, 0.45, L.ty / 100);
      s.userData = { kind: 'spot', room: roomOf(L.x, L.y) };
      scene.add(s, s.target); interior.push(s);
    } else if (L.kind === 'pendant') addPoint(L.x, L.y, L.z, 0xffcf98, 5, 'pendant', roomOf(L.x, L.y));
    else if (L.kind === 'lamp') addPoint(L.x, L.y, L.z, 0xffcf98, 4.5, 'lamp', roomOf(L.x, L.y));
    else if (L.kind === 'bed') addPoint(L.x, L.y - 8, L.z, 0xffcf98, 3, 'bed', roomOf(L.x, L.y));
  });
  // 灯槽补光：每个灯槽房间 1~2 个吊顶附近的柔光点
  (H.lighting.coveRooms || []).concat(['kitchen', 'mbath', 'gbath']).forEach(id => {
    const r = R[id]; if (!r) return;
    const [cx, cy] = S.polyCenter(r.poly);
    if (id === 'living') { addPoint(380, 560, 255, 0xffc890, 8, 'cove', id); addPoint(740, 560, 255, 0xffc890, 8, 'cove', id); addPoint(840, 385, 255, 0xffc890, 6, 'cove', id); }
    else addPoint(cx, cy, 255, 0xffc890, 6, 'cove', id);
  });

  // 三档氛围
  const MODES = {
    dusk: { sky: 'dusk', sun: [-0.55, 0.28, 0.79], sunC: 0xffa458, sunI: 2.9, hemiS: 0xe6bf9c, hemiG: 0x9c7a5c, hemiI: 0.26, amb: 0.05, env: 0.32, exp: 0.9,
      lights: { spot: 2.4, pendant: 1.4, lamp: 1.3, bed: 0.9, cove: 0.42 }, wash: 0.34, glow: 0.34, halo: 0.2, fog: 0xe8c7a6 },
    day: { sky: 'day', sun: [0.25, 0.62, 0.74], sunC: 0xfff3e2, sunI: 2.5, hemiS: 0xdfe8ee, hemiG: 0xb39878, hemiI: 0.4, amb: 0.04, env: 0.45, exp: 0.92,
      lights: { spot: 0, pendant: 0, lamp: 0, bed: 0, cove: 0 }, wash: 0.0, glow: 0.0, halo: 0.0, fog: 0xdfe8ee },
    night: { sky: 'night', sun: [0.3, 0.55, -0.78], sunC: 0x8fa6d6, sunI: 0.12, hemiS: 0x24324c, hemiG: 0x1a1612, hemiI: 0.08, amb: 0.03, env: 0.18, exp: 1.05,
      lights: { spot: 3.0, pendant: 2.0, lamp: 1.8, bed: 1.4, cove: 0.7 }, wash: 0.5, glow: 0.55, halo: 0.35, fog: 0x0b1120 }
  };
  const skyTex = {};
  let mode = 'dusk';
  function setMode(m) {
    mode = m; const P = MODES[m];
    const d = new THREE.Vector3(...P.sun).normalize();
    if (!skyTex[m]) skyTex[m] = mats.sky(P.sky, d);
    skyMesh.material.map = skyTex[m]; skyMesh.material.needsUpdate = true;
    sun.position.copy(sun.target.position).addScaledVector(d, 30);
    sun.color.set(P.sunC); sun.intensity = P.sunI;
    hemi.color.set(P.hemiS); hemi.groundColor.set(P.hemiG); hemi.intensity = P.hemiI;
    ambient.intensity = P.amb;
    renderer.toneMappingExposure = P.exp;
    scene.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.env != null) o.material.envMapIntensity = o.material.userData.env * P.env / 0.55; });
    mats.emissives.forEach(e => { e.m.emissiveIntensity = e[m]; });
    S.DYN.washes.forEach(w => { w.material.opacity = P.wash; w.visible = P.wash > 0.02; });
    S.DYN.ceilGlows.forEach(w => { w.material.opacity = P.glow; });
    S.DYN.halos.forEach(w => { w.material.opacity = P.halo; w.visible = P.halo > 0.01 && view !== 'plan'; });
    S.DYN.ceilGlows.forEach(w => { w.visible = P.glow > 0.01; });
    interior.forEach(l => { l.userData.base = P.lights[l.userData.kind] || 0; });
    renderer.shadowMap.needsUpdate = true;
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    cullLights();
  }

  // ---------------------------------------------------------------- 视角
  const orbit = new THREE.OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.dampingFactor = 0.09;
  orbit.screenSpacePanning = false;
  orbit.zoomSpeed = 0.9; orbit.rotateSpeed = 0.55;
  let view = 'eye';               // 'eye' | 'plan'
  let yaw = 0, pitch = 0, fovT = 70;
  const eyeH = 1.55;
  const tween = { t: 1, from: null, to: null };
  function lerpCam(toPos, toTarget, dur = 0.9, after) {
    tween.from = { p: camera.position.clone(), t: orbit.target.clone() };
    tween.to = { p: toPos.clone(), t: toTarget.clone() };
    tween.t = 0; tween.dur = dur; tween.after = after;
  }
  function eyeLookAt(target) {
    const d = target.clone().sub(camera.position);
    yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
  function applyEye() {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
  }

  // 每间房的人视角机位：取 home.json 的 cam（cm, z 为高度）
  function roomCam(id) {
    const r = R[id];
    const c = r.cam || { p: [...r.eye, 155], l: [...r.look, 100] };
    return { p: new THREE.Vector3(c.p[0] / 100, eyeH, c.p[1] / 100), l: new THREE.Vector3(c.l[0] / 100, c.l[2] / 100, c.l[1] / 100) };
  }
  const OVERRIDE = {       // 对齐参考图构图的机位
    living: { p: [800, 372], l: [470, 765, 92], fov: 76 },
    foyer: { p: [492, 118], l: [470, 640, 100], fov: 74 },
    kitchen: { p: [168, 748], l: [45, 470, 100], fov: 80 },
    master: { p: [1262, 735], l: [1475, 500, 92], fov: 78 },
    mbath: { p: [1378, 205], l: [1450, 320, 105], fov: 84 },
    gbath: { p: [968, 300], l: [925, 40, 108], fov: 82 },
    guest: { p: [822, 215], l: [585, 110, 92], fov: 80 },
    study: { p: [1292, 280], l: [1110, 80, 110], fov: 82 },
    studio: { p: [975, 470], l: [1085, 760, 82], fov: 80 },
    balcony: { p: [40, 790], l: [820, 965, 100], fov: 78 }
  };
  function camFor(id) {
    const o = OVERRIDE[id];
    if (o) return { p: new THREE.Vector3(o.p[0] / 100, eyeH, o.p[1] / 100), l: new THREE.Vector3(o.l[0] / 100, o.l[2] / 100, o.l[1] / 100), fov: o.fov };
    return Object.assign(roomCam(id), { fov: 72 });
  }
  let curRoom = 'living';
  function goRoom(id, instant) {
    curRoom = id;
    const c = camFor(id);
    if (view === 'plan') setView('eye', true);
    fovT = c.fov;
    if (instant) { camera.position.copy(c.p); eyeLookAt(c.l); applyEye(); }
    else {
      const d = c.l.clone().sub(c.p);
      const y1 = Math.atan2(-d.x, -d.z), p1 = Math.atan2(d.y, Math.hypot(d.x, d.z));
      walkTo = { from: camera.position.clone(), to: c.p, y0: yaw, y1: nearestAngle(yaw, y1), p0: pitch, p1, t: 0, dur: 1.1 };
    }
    showRoom(id);
  }
  function nearestAngle(a, b) { while (b - a > Math.PI) b -= Math.PI * 2; while (b - a < -Math.PI) b += Math.PI * 2; return b; }
  let walkTo = null;

  // 俯瞰 / 剖切
  const CUT = 1.15;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT);
  const cutMats = [M.plaster_terra, M.plaster_warm, M.plaster_keep, M.exterior, M.tile_kwall, M.bath_mb, M.bath_gb, M.bath_blush,
    M.door_frame, M.door_leaf, M.walnut_door, M.walnut_frame, M.alu_win, M.glass_win, M.glass_bath, M.wallcap, M.led, M.baseboard,
    M.fixture, M.lens, M.lantern, M.drape, M.drape_taupe, M.drape_grey, M.sheer];
  function setView(v, keepPos) {
    view = v;
    const plan = v === 'plan';
    S.DYN.ceilings.forEach(c => c.visible = !plan);
    S.DYN.washes.forEach(w => w.visible = !plan && MODES[mode].wash > 0.02);
    S.DYN.overlays.forEach(o => o.visible = !plan || o.position.y < 1 || o.geometry.boundingBox === undefined);
    renderer.clippingPlanes = [];
    cutMats.forEach(m => { m.clippingPlanes = plan ? [clipPlane] : null; m.clipShadows = false; m.needsUpdate = true; });
    S.DYN.halos.forEach(h => h.visible = !plan);
    document.body.classList.toggle('plan', plan);
    skyMesh.visible = !plan; scene.background = plan ? planBg : null;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    if (plan) {
      orbit.enabled = true;
      orbit.minDistance = 5; orbit.maxDistance = 30; orbit.minPolarAngle = 0.05; orbit.maxPolarAngle = Math.PI * 0.42;
      orbit.enablePan = true;
      fovT = 42;
      const tgt = new THREE.Vector3(7.6, 0, 5.1);
      lerpCam(new THREE.Vector3(7.6, 15.5, 14.2), tgt, keepPos ? 0.01 : 1.0);
    } else {
      orbit.enabled = false;
    }
    cullLights();
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------------------------------------------------------------- 输入：人视角
  const keys = {};
  addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; keys[e.code] = true; });
  addEventListener('keyup', e => keys[e.code] = false);
  let drag = null, moved = 0;
  renderer.domElement.addEventListener('pointerdown', e => {
    if (view !== 'eye') { moved = 0; drag = { x: e.clientX, y: e.clientY, plan: true }; return; }
    drag = { x: e.clientX, y: e.clientY }; moved = 0; walkTo = null;
    renderer.domElement.setPointerCapture(e.pointerId);
    document.body.classList.add('grabbing');
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (drag.plan) return;
    const k = (camera.fov / 70) * 0.0042;
    yaw += dx * k; pitch = Math.max(-1.25, Math.min(1.25, pitch + dy * k));
    drag.x = e.clientX; drag.y = e.clientY;
    hideHint();
  });
  addEventListener('pointerup', e => {
    if (drag && moved < 6) onClick(e);
    drag = null; document.body.classList.remove('grabbing');
  });
  renderer.domElement.addEventListener('wheel', e => {
    if (view !== 'eye') return;
    e.preventDefault();
    fovT = Math.max(35, Math.min(95, fovT + e.deltaY * 0.04));
    hideHint();
  }, { passive: false });
  renderer.domElement.addEventListener('dblclick', e => { if (view === 'eye') walkToPointer(e); });

  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pointerNDC(e) { return new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }
  function walkToPointer(e) {
    ray.setFromCamera(pointerNDC(e), camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, hit)) return;
    const from = camera.position.clone();
    const dir = new THREE.Vector3(hit.x - from.x, 0, hit.z - from.z);
    const dist = dir.length(); if (dist < 0.2) return;
    dir.normalize();
    // 沿路径找第一处碰撞，停在前方 0.4m
    let reach = dist;
    for (let s = 0.1; s < dist; s += 0.08) {
      const p = from.clone().addScaledVector(dir, s);
      if (blocked(from.x + dir.x * (s - 0.08), from.z + dir.z * (s - 0.08), p.x, p.z)) { reach = Math.max(0, s - 0.4); break; }
    }
    const to = from.clone().addScaledVector(dir, reach); to.y = eyeH;
    walkTo = { from, to, y0: yaw, y1: yaw, p0: pitch, p1: pitch, t: 0, dur: Math.min(1.6, 0.35 + reach * 0.22) };
    const r = S.roomAt(to.x * 100, to.z * 100); if (r) showRoom(r.id);
    hideHint();
  }
  function onClick(e) {
    if (view === 'plan') {
      ray.setFromCamera(pointerNDC(e), camera);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(floorPlane, hit)) { const r = S.roomAt(hit.x * 100, hit.z * 100); if (r) { showRoom(r.id); goRoom(r.id); } }
    }
  }

  // 碰撞：墙段（2D 线段相交）+ 家具 AABB
  function segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
    const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }
  function distSeg(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - ax - vx * t, py - ay - vy * t);
  }
  function blocked(x0, z0, x1, z1) {
    const rad = 0.22;
    for (const s of S.COLL.segs) {
      if (s[4] > 150) continue;                 // 过梁（离地 >1.5m）不挡人
      if (segX(x0, z0, x1, z1, s[0], s[1], s[2], s[3])) return true;
      const d1 = distSeg(x1, z1, s[0], s[1], s[2], s[3]);
      if (d1 < rad && d1 < distSeg(x0, z0, s[0], s[1], s[2], s[3]) - 1e-5) return true;   // 只拦"越走越近"
    }
    const inBox = (x, z, b) => x > b[0] - rad && x < b[2] + rad && z > b[1] - rad && z < b[3] + rad;
    for (const b of S.COLL.boxes) if ((b[4] || 0.9) > 0.3 && inBox(x1, z1, b) && !inBox(x0, z0, b)) return true;
    return false;
  }

  // ---------------------------------------------------------------- 灯光剔除（只开当前及相邻房间的灯）
  function cullLights() {
    const P = MODES[mode];
    const cam = camera.position;
    const here = S.roomAt(cam.x * 100, cam.z * 100);
    const near = new Set(view === 'plan' ? Object.keys(R) : [here ? here.id : curRoom, curRoom, 'living', 'foyer']);
    let budget = view === 'plan' ? 10 : 14;
    const list = interior.slice().sort((a, b) => a.position.distanceToSquared(cam) - b.position.distanceToSquared(cam));
    list.forEach(l => {
      const on = l.userData.base > 0 && near.has(l.userData.room) && budget > 0;
      if (on) budget--;
      l.visible = true;                 // 保持着色器程序稳定：只改强度
      l.intensity = on ? l.userData.base : 0;
    });
  }

  // ---------------------------------------------------------------- UI
  const panel = document.getElementById('room-panel');
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function showRoom(id) {
    const r = R[id]; if (!r) return;
    curRoom = id;
    document.querySelectorAll('.rbtn').forEach(b => b.classList.toggle('on', b.dataset.room === id));
    const sec = (cls, title, arr) => arr && arr.length ? `<div class="sec ${cls}"><b>${title}</b><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    panel.innerHTML = `
      <div class="ph"><span class="no">${esc(r.no || '')}</span><div><h2>${esc(r.name)}</h2><p>${esc(r.area)} ㎡ · ${esc(r.where || '')}</p></div></div>
      ${sec('keep', '保留', r.keep)}${sec('change', '改动', r.change)}${sec('add', '新增', r.add)}${sec('todo', '待定', r.todo)}`;
    panel.classList.add('show');
    cullLights();
  }
  const bar = document.getElementById('rooms');
  const ORDER = ['foyer', 'living', 'kitchen', 'master', 'mbath', 'gbath', 'guest', 'study', 'studio', 'balcony'];
  ORDER.forEach(id => {
    const r = R[id]; if (!r) return;
    const b = document.createElement('button'); b.className = 'rbtn'; b.dataset.room = id;
    b.innerHTML = `<span>${esc(r.name.split(' · ')[0].split('（')[0])}</span><small>${esc(r.area)}㎡</small>`;
    b.onclick = () => goRoom(id); bar.appendChild(b);
  });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (b.dataset.view === 'plan') setView('plan'); else goRoom(curRoom); });
  document.getElementById('b-shot').onclick = () => {
    renderer.render(scene, camera);
    const a = document.createElement('a'); a.href = renderer.domElement.toDataURL('image/png');
    a.download = `${R[curRoom].name.split(' · ')[0]}-${{ dusk: '黄昏', day: '日间', night: '夜晚' }[mode]}.png`; a.click();
  };
  document.getElementById('b-panel').onclick = () => panel.classList.toggle('show');
  const hint = document.getElementById('hint');
  let hintT = setTimeout(hideHint, 9000);
  function hideHint() { hint.classList.add('fade'); clearTimeout(hintT); }

  // 俯瞰房间标签
  const labelLayer = document.getElementById('labels');
  const labelEls = S.DYN.labels.map(L => {
    const el = document.createElement('div'); el.className = 'lbl';
    el.innerHTML = `${esc(L.name.split(' · ')[0])}<small>${L.area}㎡</small>`;
    el.onclick = () => goRoom(L.id);
    labelLayer.appendChild(el); return { el, v: new THREE.Vector3(L.x, 1.3, L.z) };
  });

  // ---------------------------------------------------------------- 主循环
  const clock = new THREE.Clock();
  const _v = new THREE.Vector3();
  let lastCull = 0, fpsAcc = 0, fpsN = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    camera.fov += (fovT - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix();
    if (tween.t < 1) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.from.p, tween.to.p, e);
      orbit.target.lerpVectors(tween.from.t, tween.to.t, e);
      if (tween.t >= 1 && tween.after) tween.after();
    }
    if (view === 'eye') {
      if (walkTo) {
        walkTo.t = Math.min(1, walkTo.t + dt / walkTo.dur);
        const e = walkTo.t < 0.5 ? 2 * walkTo.t * walkTo.t : 1 - (-2 * walkTo.t + 2) ** 2 / 2;
        camera.position.lerpVectors(walkTo.from, walkTo.to, e);
        yaw = walkTo.y0 + (walkTo.y1 - walkTo.y0) * e; pitch = walkTo.p0 + (walkTo.p1 - walkTo.p0) * e;
        if (walkTo.t >= 1) walkTo = null;
      }
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 3.2 : 1.6) * dt;
      let fx = 0, fz = 0;
      if (keys.KeyW || keys.ArrowUp) fz -= 1; if (keys.KeyS || keys.ArrowDown) fz += 1;
      if (keys.KeyA) fx -= 1; if (keys.KeyD) fx += 1;
      if (keys.ArrowLeft) yaw += dt * 1.6; if (keys.ArrowRight) yaw -= dt * 1.6;
      if (fx || fz) {
        walkTo = null; hideHint();
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const mx = (fx * c + fz * s) * sp, mz = (-fx * s + fz * c) * sp;
        const x0 = camera.position.x, z0 = camera.position.z;
        if (!blocked(x0, z0, x0 + mx, z0 + mz)) { camera.position.x += mx; camera.position.z += mz; }
        else if (!blocked(x0, z0, x0 + mx, z0)) camera.position.x += mx;
        else if (!blocked(x0, z0, x0, z0 + mz)) camera.position.z += mz;
      }
      camera.position.y = eyeH;
      applyEye();
    } else {
      orbit.update();
      labelEls.forEach(({ el, v }) => {
        _v.copy(v).project(camera);
        el.style.transform = `translate(-50%,-50%) translate(${(_v.x + 1) / 2 * innerWidth}px,${(1 - _v.y) / 2 * innerHeight}px)`;
      });
    }
    S.DYN.halos.forEach(h => { if (!h.userData.billboard) return; h.quaternion.copy(camera.quaternion); });
    if (clock.elapsedTime - lastCull > 0.5) {
      lastCull = clock.elapsedTime; cullLights();
      const here = S.roomAt(camera.position.x * 100, camera.position.z * 100);
      if (view === 'eye' && here && here.id !== curRoom) showRoom(here.id);
    }
    renderer.render(scene, camera);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) { window.NATIVE.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // 启动
  setMode('dusk');
  goRoom('living', true);
  orbit.enabled = false;
  renderer.shadowMap.needsUpdate = true;
  frame();
  document.getElementById('loading').classList.add('done');

  window.NATIVE = { setMode, setView, goRoom, scene, camera, renderer, S, M, interior, info: () => renderer.info, fps: 0,
    look: (yw, pt) => { yaw = yw; pitch = pt; }, state: () => ({ view, mode, curRoom, yaw, pitch, pos: camera.position.toArray() }) };
})();
