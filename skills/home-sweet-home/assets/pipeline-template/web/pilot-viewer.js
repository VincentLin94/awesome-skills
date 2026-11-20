/* Living-room pilot, real-time PBR edition: glTF + sun/night lamps + PMREM RoomEnvironment.
 * No lightmaps, no local render. Lighting layout mirrors blender/lights.py.
 */
(function () {
  const A = window.ASSETS, L = window.LIGHTS;
  const MATS = window.MATS, TEX = A.tex;
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 200);
  const pv = p => new THREE.Vector3(p[0] / 100, p[1] / 100, p[2] / 100);
  const CAMP = pv([232, 152, 738]), LOOK = pv([700, 110, 520]);
  if (window.__CAM) { CAMP.fromArray(window.__CAM.p); LOOK.fromArray(window.__CAM.t); }
  camera.position.copy(CAMP);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

  const orbit = new THREE.OrbitControls(camera, renderer.domElement);
  orbit.target.copy(LOOK); orbit.enableDamping = true; orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.52; orbit.minDistance = 0.5; orbit.maxDistance = 30;

  let mode = 'day', walk = false, yaw = 0, pitch = 0;
  const lightsGroup = new THREE.Group(); scene.add(lightsGroup);


  function tx(name, linear) {
    if (!TEX[name]) return null;
    const t = new THREE.TextureLoader().load(TEX[name]);
    t.encoding = linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8; t.needsUpdate = true;
    return t;
  }

  function buildMaterial(name, original) {
    const spec = MATS ? MATS[name] : null;
    if (!spec && original) return original;
    const kind = spec && spec.kind || 'opaque';
    const isGlass = kind === 'glass', isSheer = kind === 'sheer';
    const m = new (isGlass ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({
      color: new THREE.Color(spec && spec.tint || '#ffffff'),
      roughness: spec && spec.rough != null ? spec.rough : 0.7,
      metalness: spec && spec.metal || 0,
      envMapIntensity: isGlass ? 1.0 : 0.3
    });
    m.name = name;
    if (spec && spec.tex && spec.tex !== 'art_canvas') {
      const id = spec.tex, rep = 1 / spec.tile;
      const diffName = spec.detail ? `${id}_detail` : `${id}_Diffuse`;
      const map = tx(diffName, spec.detail);
      if (map) { map.repeat.set(rep, rep); map.encoding = THREE.sRGBEncoding; m.map = map; }
      const nrm = tx(`${id}_nor_gl`, true);
      if (nrm) { nrm.repeat.set(rep, rep); nrm.encoding = THREE.LinearEncoding; m.normalMap = nrm; m.normalScale.set(spec.nstr || 0.6, spec.nstr || 0.6); }
      const rgh = tx(`${id}_Rough`, true);
      if (rgh) { rgh.repeat.set(rep, rep); rgh.encoding = THREE.LinearEncoding; m.roughnessMap = rgh; }
      m.envMapIntensity = spec.tex ? 0.5 : 0.3;
    } else if (spec && spec.tex === 'art_canvas') {
      const map = tx('art_canvas'); if (map) m.map = map;
    }
    if (isGlass) { m.transparent = true; m.opacity = 0.15; m.roughness = 0.05; m.depthWrite = false; m.side = THREE.DoubleSide; }
    if (isSheer) { m.transparent = true; m.opacity = 0.4; m.side = THREE.DoubleSide; }
    m.userData.kind = kind;
    return m;
  }

  function dataURIToArrayBuffer(uri) {
    const b = atob(uri.split(',')[1]);
    const arr = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
    return arr.buffer;
  }

  const LOG = msg => {
    const el = document.createElement('pre');
    el.style.cssText = 'position:fixed;z-index:99;top:80px;left:16px;background:#fff;color:#a00;padding:10px;font-size:12px;max-width:90vw;white-space:pre-wrap';
    el.textContent = msg; document.body.appendChild(el);
  };
  try {
    const bin = dataURIToArrayBuffer(A.glb);
    new THREE.GLTFLoader().parse(bin, '', gltf => {
    const root = gltf.scene;
    const cache = {};
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      o.material = cache[list[0].name] || (cache[list[0].name] = buildMaterial(list[0].name, list[0]));  // flatten: single material, no empty groups
    });
    scene.add(root);
    window.__D = { scene, camera, renderer, root };
    buildLights();
    document.getElementById('loader').style.opacity = 0;
    setTimeout(() => document.getElementById('loader').remove(), 600);
    animate();
  }, undefined, e => LOG('GLTF ERROR: ' + (e && e.message || e)));
  } catch (e) { LOG('JS ERROR: ' + (e && e.stack || e)); }

  function clearLights() {
    while (lightsGroup.children.length) lightsGroup.remove(lightsGroup.children[0]);
  }
  function shadowCfg(l) {
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.camera.left = -8; l.shadow.camera.right = 8;
    l.shadow.camera.top = 8; l.shadow.camera.bottom = -8;
    l.shadow.camera.near = 0.2; l.shadow.camera.far = 22; l.shadow.bias = -0.0004;
  }

  function buildLights() {
    clearLights();
    const d = L[mode];
    scene.background = new THREE.Color(mode === 'day' ? 0xdce3e7 : 0x0a0f17);
    if (mode === 'day') {
      const sun = new THREE.DirectionalLight(new THREE.Color(...d.sun.color), d.sun.i);
      sun.position.copy(pv(d.sun.p)); sun.target.position.copy(pv(d.sun.t));
      shadowCfg(sun);
      lightsGroup.add(sun, sun.target);
      lightsGroup.add(new THREE.HemisphereLight(
        new THREE.Color(...d.hemi.sky), new THREE.Color(...d.hemi.ground), d.hemi.i));
      const fill = new THREE.PointLight(new THREE.Color(...d.fill.color), d.fill.i, 12, 1.5);
      fill.position.copy(pv(d.fill.p)); lightsGroup.add(fill);
      renderer.toneMappingExposure = 1.0;
    } else {
      lightsGroup.add(new THREE.HemisphereLight(0x1a2436, 0x201813, 0.12));
      d.spots.forEach(p => {
        const s = new THREE.SpotLight(0xffcf9a, 5.5, 7, Math.PI / 6, 0.6, 1.8);
        s.position.copy(pv(p)); s.target.position.set(pv(p).x, 0.02, pv(p).z);
        shadowCfg(s); lightsGroup.add(s, s.target);
      });
      d.cove.forEach(p => {
        const pt = new THREE.PointLight(0xffd3a0, 0.9, 3.4, 1.8);
        pt.position.copy(pv(p)); lightsGroup.add(pt);
      });
      d.points.forEach(q => {
        const pt = new THREE.PointLight(new THREE.Color(...q.color), q.i / 3.2, 6, 1.6);
        pt.position.copy(pv(q.p)); lightsGroup.add(pt);
      });
      renderer.toneMappingExposure = 0.95;
    }
    scene.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (!m || !m.userData) return;
        if (m.userData.kind === 'emissive') { m.emissive = new THREE.Color('#ffd8a0'); m.emissiveIntensity = mode === 'night' ? 0.6 : 0; }
        if (m.userData.kind === 'shade') { m.emissive = new THREE.Color('#ffd3a0'); m.emissiveIntensity = mode === 'night' ? 0.35 : 0; }
        m.needsUpdate = true;
      });
    });
  }

  function setModeBtn(id, on) { document.getElementById(id).classList.toggle('on', on); }
  document.getElementById('b-day').onclick = () => { mode = 'day'; buildLights(); setModeBtn('b-day', 1); setModeBtn('b-night', 0); };
  document.getElementById('b-night').onclick = () => { mode = 'night'; buildLights(); setModeBtn('b-night', 1); setModeBtn('b-day', 0); };
  document.getElementById('b-orbit').onclick = () => setWalk(false);
  document.getElementById('b-walk').onclick = () => setWalk(true);
  document.getElementById('b-shot').onclick = () => {
    const a = document.createElement('a'); a.href = renderer.domElement.toDataURL('image/png');
    a.download = '客餐厅-效果图.png'; a.click();
  };
  const keys = {};
  addEventListener('keydown', e => keys[e.code] = true);
  addEventListener('keyup', e => keys[e.code] = false);
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', e => { if (!walk) return; drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!drag) return;
    yaw -= (e.clientX - drag.x) * 0.003;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - drag.y) * 0.003));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  addEventListener('pointerup', () => drag = null);

  function setWalk(on) {
    walk = on; orbit.enabled = !on; setModeBtn('b-walk', on); setModeBtn('b-orbit', !on);
    if (on) {
      const dir = camera.position.clone().sub(orbit.target).setY(0).normalize();
      yaw = Math.atan2(dir.x, dir.z); pitch = 0; camera.position.y = 1.55;
    } else { camera.position.copy(CAMP); orbit.target.copy(LOOK); }
  }
  const ZONES = [[[1.30, 0.68], [8.78, 3.32]], [[3.65, 0.68], [5.68, 3.32]], [[-0.12, 7.55], [8.78, 10.18]]];
  const inside = (x, z) => ZONES.some(([[x0, z0], [x1, z1]]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);

  function animate() {
    requestAnimationFrame(animate);
    if (walk) {
      const spd = (keys.ShiftLeft ? 4.5 : 2.2) / 60;
      const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const r = new THREE.Vector3(f.z, 0, -f.x);
      let nx = camera.position.x, nz = camera.position.z;
      if (keys.KeyW) { nx += f.x * spd; nz += f.z * spd; }
      if (keys.KeyS) { nx -= f.x * spd; nz -= f.z * spd; }
      if (keys.KeyA) { nx -= r.x * spd; nz -= r.z * spd; }
      if (keys.KeyD) { nx += r.x * spd; nz += r.z * spd; }
      if (inside(nx, nz)) { camera.position.x = nx; camera.position.z = nz; }
      camera.position.y = 1.55;
      camera.rotation.order = 'YXZ'; camera.rotation.y = yaw; camera.rotation.x = pitch;
    } else {
      if (window.__FORCE_CAM) {
        camera.position.fromArray(window.__FORCE_CAM.p);
        camera.lookAt(new THREE.Vector3().fromArray(window.__FORCE_CAM.t));
      }
      orbit.update();
    }
    renderer.render(scene, camera);
  }
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  });
})();
