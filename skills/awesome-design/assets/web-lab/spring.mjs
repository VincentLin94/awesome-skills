// Critical damping: values and velocity use the same unit and units/second.
export function criticalStep(position, velocity, target, omega, seconds) {
  const offset = position - target;
  const b = velocity + omega * offset;
  const decay = Math.exp(-omega * seconds);
  return {
    position: target + (offset + b * seconds) * decay,
    velocity: (velocity - omega * b * seconds) * decay,
  };
}

export function createSpring({
  value = 0, omega = 22, restDistance = .05, restSpeed = .1,
  onChange = () => {}, bounds = () => ({ min: -Infinity, max: Infinity }),
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
} = {}) {
  let position = value, velocity = 0, target = value;
  let frame = null, lastTime = now(), disposed = false;
  function constrain() {
    const { min, max } = bounds();
    if (position < min) { position = min; velocity = Math.max(0, velocity); }
    if (position > max) { position = max; velocity = Math.min(0, velocity); }
  }
  function cancel() { if (frame !== null) cancelFrame(frame); frame = null; }
  function advance(time) {
    const dt = Math.min(.064, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    ({ position, velocity } = criticalStep(position, velocity, target, omega, dt));
    constrain();
  }
  function tick(time) {
    frame = null;
    if (disposed) return;
    advance(time);
    const settled = Math.abs(position - target) < restDistance && Math.abs(velocity) < restSpeed;
    if (settled) { position = target; velocity = 0; }
    onChange(position, velocity);
    if (!settled) frame = requestFrame(tick);
  }
  function flush() {
    if (frame !== null) { advance(now()); onChange(position, velocity); }
  }
  return {
    setTarget(next, { velocity: releaseVelocity, immediate = false } = {}) {
      if (disposed) return;
      if (!Number.isFinite(next)) throw new TypeError('Target must be finite');
      flush(); const {min,max} = bounds(); target = Math.max(min, Math.min(max, next));
      if (releaseVelocity !== undefined) velocity = releaseVelocity;
      if (immediate) { cancel(); position = target; velocity = 0; onChange(position, velocity); return; }
      lastTime = now();
      if (frame === null) frame = requestFrame(tick);
    },
    grab() { flush(); cancel(); velocity = 0; target = position; return position; },
    setPosition(next) { if (disposed) return; cancel(); position = next; velocity = 0; constrain(); target = position; onChange(position, velocity); },
    settle() { if (disposed) return; cancel(); position = target; velocity = 0; onChange(position, velocity); },
    snapshot() { return { position, velocity, target, running: frame !== null, disposed }; },
    dispose() { disposed = true; cancel(); },
  };
}

// A short history prevents a fast move followed by a stationary hold from flinging.
export function releaseVelocity(samples, time, position, windowMs = 80) {
  const recent = [...samples, { time, position }].filter(s => time - s.time <= windowMs);
  const first = recent[0];
  const dt = (time - first.time) / 1000;
  return dt > .004 ? (position - first.position) / dt : 0;
}

export function nearestSnap(position, velocity, stops, horizon = .14) {
  const predicted = position + velocity * horizon;
  return stops.reduce((best, p) => Math.abs(p - predicted) < Math.abs(best - predicted) ? p : best, stops[0]);
}
