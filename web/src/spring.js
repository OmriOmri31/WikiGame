const REST_DISTANCE = 0.5;
const REST_VELOCITY = 20;

export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function project(initialVelocity, decelerationRate = 0.998) {
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

export function readTranslateY(element) {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === 'none') return 0;
  return new DOMMatrix(transform).m42;
}

export function spring({
  from,
  to,
  velocity = 0,
  response = 0.3,
  dampingRatio = 1,
  onUpdate,
  onRest,
}) {
  const stiffness = (2 * Math.PI / response) ** 2;
  const damping = dampingRatio * 2 * Math.sqrt(stiffness);
  let x = from;
  let v = velocity;
  let last = performance.now();
  let frame = 0;
  let stopped = false;

  const step = (now) => {
    if (stopped) return;
    let remaining = Math.min(0.032, (now - last) / 1000);
    last = now;
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 120);
      const accel = -stiffness * (x - to) - damping * v;
      v += accel * h;
      x += v * h;
      remaining -= h;
    }
    onUpdate(x);
    if (Math.abs(x - to) < REST_DISTANCE && Math.abs(v) < REST_VELOCITY) {
      onUpdate(to);
      onRest?.();
      return;
    }
    frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
