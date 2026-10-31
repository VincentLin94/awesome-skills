import * as THREE from 'three';

export function createMaterialScene({ canvas, host, textureURL, onStatus = () => {} }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    onStatus('fallback', '当前环境使用静态材质预览。');
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3, 3, 2.1, -2.1, .1, 40);
  camera.position.set(0, 1.7, 6);
  camera.lookAt(0, -.05, 0);
  const hemi = new THREE.HemisphereLight(0xfffaf0, 0x6e6254, 2.2);
  const key = new THREE.DirectionalLight(0xfff5e5, 3.3);
  key.position.set(-3, 5, 4);
  const fill = new THREE.DirectionalLight(0xe6edff, 1.4);
  fill.position.set(4, 1, -2);
  scene.add(hemi, key, fill);

  function roundedShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  const geometry = new THREE.ExtrudeGeometry(roundedShape(2.75, 1.8, .17), {
    depth: .13, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .055, bevelThickness: .055, curveSegments: 10,
  });
  geometry.center();
  const material = new THREE.MeshPhysicalMaterial({ color: 0xe9dfc7, roughness: .9, metalness: 0, sheen: .4, sheenRoughness: .85, sheenColor: 0xfff3dd });
  const backMaterial = new THREE.MeshStandardMaterial({ color: 0xd1c5ae, roughness: .98 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xb53c30, roughness: .8 });
  const swatch = new THREE.Group();
  const back = new THREE.Mesh(geometry, backMaterial);
  back.position.set(.13, -.12, -.23);
  const front = new THREE.Mesh(geometry, material);
  const pinGeometry = new THREE.SphereGeometry(.105, 20, 12);
  const pin = new THREE.Mesh(pinGeometry, accentMaterial);
  pin.position.set(1.04, .62, .17);
  swatch.add(back, front, pin);
  scene.add(swatch);

  // One static CanvasTexture for contact shadow; no 2D render loop.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const radial = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  radial.addColorStop(0, 'rgba(49,37,19,.28)'); radial.addColorStop(1, 'rgba(49,37,19,0)');
  ctx.fillStyle = radial; ctx.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  const shadowGeometry = new THREE.PlaneGeometry(4.4, 2.7);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.16;
  scene.add(shadow);

  let texture = null, disposed = false, lost = false, enabled = true;
  let visible = true, autoRotate = false, reduced = false, frame = null, lastTime = 0;
  let angle = -.34, pitch = -.08, velocity = 0, drag = null;
  let frameCount = 0, hasSize = false;
  const listeners = [];
  function listen(target, name, fn, options) { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); }
  function cancel() { if (frame !== null) cancelAnimationFrame(frame); frame = null; lastTime = 0; }
  function canRender() { return !disposed && !lost && enabled && visible && !document.hidden && hasSize; }
  function schedule() { if (frame === null && canRender()) frame = requestAnimationFrame(render); }
  function render(time) {
    frame = null;
    if (!canRender()) return;
    const dt = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 0;
    lastTime = time;
    if (!drag && !reduced) {
      if (autoRotate) angle += dt * .28;
      else if (Math.abs(velocity) > .003) { angle += velocity * dt; velocity *= Math.exp(-9 * dt); }
    }
    swatch.rotation.set(pitch, angle, -.05);
    renderer.render(scene, camera); frameCount++;
    host.dataset.frames = String(frameCount);
    if (!drag && !reduced && (autoRotate || Math.abs(velocity) > .003)) schedule();
    else { velocity = 0; lastTime = 0; }
  }
  function resize() {
    if (disposed) return;
    const width = host.clientWidth, height = host.clientHeight;
    hasSize = width > 0 && height > 0;
    if (!hasSize) { cancel(); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    const aspect = width / height, viewHeight = Math.max(3.6, 4.4 / aspect);
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix(); schedule();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) schedule(); else { velocity = 0; cancel(); }
  });
  intersectionObserver.observe(host);
  listen(document, 'visibilitychange', () => { if (document.hidden) { cancelDrag(); velocity = 0; cancel(); } else schedule(); });
  listen(window, 'resize', resize);
  listen(canvas, 'pointerdown', e => {
    if (!enabled || lost || !e.isPrimary || e.button !== 0) return;
    velocity = 0;
    drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, angle, pitch, samples: [{x:e.clientX,time:e.timeStamp}] };
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
  });
  listen(canvas, 'pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    angle = drag.angle + (e.clientX - drag.startX) * .007;
    pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.startY) * .003, -.45, .35);
    drag.samples.push({x:e.clientX,time:e.timeStamp});
    drag.samples = drag.samples.filter(p => e.timeStamp - p.time <= 80);
    schedule();
  });
  function cancelDrag() {
    if (!drag) return;
    const id = drag.id; drag = null; velocity = 0; canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  listen(canvas, 'pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const history = [...drag.samples,{x:e.clientX,time:e.timeStamp}].filter(p => e.timeStamp - p.time <= 80);
    const first = history[0], dt = (e.timeStamp - first.time) / 1000;
    const speed = !reduced && dt > .004 ? THREE.MathUtils.clamp((e.clientX - first.x) * .007 / dt,-3,3) : 0;
    cancelDrag(); velocity = speed; schedule();
  });
  listen(canvas, 'pointercancel', () => { cancelDrag(); schedule(); });
  listen(canvas, 'lostpointercapture', () => { if (drag) { drag = null; velocity = 0; canvas.style.cursor = 'grab'; schedule(); } });
  listen(canvas, 'webglcontextlost', e => { e.preventDefault(); lost = true; cancelDrag(); cancel(); onStatus('fallback','三维视图已暂停，当前显示静态替代。'); });
  listen(canvas, 'webglcontextrestored', () => { lost = false; onStatus('ready','拖动样片查看表面，也可用下方按钮转动。'); resize(); });
  new THREE.TextureLoader().load(textureURL, loaded => {
    if (disposed) { loaded.dispose(); return; }
    texture = loaded;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.2, 1.2); // data texture: leave colorSpace at NoColorSpace
    material.bumpMap = texture; material.bumpScale = .035; material.needsUpdate = true;
    schedule();
  }, undefined, () => { if (!disposed) onStatus('ready','纹理未载入，仍可查看基础材质与形体。'); });
  resize();
  onStatus('ready','拖动样片查看表面，也可用下方按钮转动。');
  return {
    setRoughness(value) { material.roughness = THREE.MathUtils.clamp(value, .05, 1); schedule(); },
    setColor(value) { material.color.set(value); schedule(); },
    rotate(direction) { velocity = 0; angle += direction * .25; schedule(); },
    reset() { cancelDrag(); angle = -.34; pitch = -.08; velocity = 0; schedule(); },
    setAuto(value) { autoRotate = Boolean(value) && !reduced; if (!autoRotate) velocity = 0; schedule(); },
    setReduced(value) { reduced = Boolean(value); if (reduced) { autoRotate = false; velocity = 0; } schedule(); },
    setEnabled(value) { enabled = Boolean(value); if (enabled) schedule(); else { cancelDrag(); velocity = 0; cancel(); } },
    stats() { return { frameCount, pending:frame !== null, disposed, visible, enabled, reduced, angle, geometries:renderer.info.memory.geometries, textures:renderer.info.memory.textures }; },
    dispose() {
      if (disposed) return;
      cancelDrag(); disposed = true; cancel();
      resizeObserver.disconnect(); intersectionObserver.disconnect(); listeners.forEach(remove => remove());
      geometry.dispose(); pinGeometry.dispose(); shadowGeometry.dispose();
      material.dispose(); backMaterial.dispose(); accentMaterial.dispose(); shadowMaterial.dispose();
      texture?.dispose(); shadowTexture.dispose(); renderer.dispose();
    },
  };
}
