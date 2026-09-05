/** Input shared by the standalone games. State is stable for the whole mount. */
export function createInput({ onPress, pressKeys } = {}) {
  const input = {
    keys: {}, pointer: { x: 0, y: 0 }, pointerActive: false,
    pointerDown: false, touchDirection: 0, dispose,
  };
  const listeners = [];
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function reset() {
    for (const key in input.keys) input.keys[key] = false;
    input.pointer.x = input.pointer.y = 0;
    input.pointerActive = input.pointerDown = false;
    input.touchDirection = 0;
  }
  function move(x, y) {
    input.pointer.x = Math.max(-1, Math.min(1, x / innerWidth * 2 - 1));
    input.pointer.y = Math.max(-1, Math.min(1, y / innerHeight * 2 - 1));
    input.pointerActive = true;
  }
  listen(window, 'keydown', e => {
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    input.keys[e.code] = true;
    if (!e.repeat && (!pressKeys || pressKeys.includes(e.code))) onPress?.();
  });
  listen(window, 'keyup', e => { input.keys[e.code] = false; });
  listen(window, 'pointermove', e => move(e.clientX, e.clientY));
  listen(window, 'pointerdown', () => { input.pointerDown = true; onPress?.(); });
  listen(window, 'pointerup', () => { input.pointerDown = false; });
  listen(window, 'touchstart', e => {
    input.touchDirection = e.touches[0].clientX < innerWidth / 2 ? -1 : 1;
  }, { passive: true });
  listen(window, 'touchmove', e => {
    if (e.touches.length) move(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  listen(window, 'touchend', () => { input.touchDirection = 0; input.pointerDown = false; });
  listen(window, 'blur', reset);
  listen(window, 'pointercancel', reset);
  listen(window, 'touchcancel', reset);
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  function dispose() { for (const remove of listeners) remove(); listeners.length = 0; reset(); }
  return input;
}

/** Pause entirely while hidden; reset elapsed time when returning from a tab or bfcache. */
export function startLoop(tick) {
  let frame = null;
  let last = performance.now();
  let pageHidden = false;
  let disposed = false;
  function draw(now) {
    frame = null;
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    tick(dt, now);
    if (!disposed && !document.hidden && !pageHidden) frame = requestAnimationFrame(draw);
  }
  function sync() {
    if (disposed || document.hidden || pageHidden) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    } else if (frame === null) {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }
  const hide = () => { pageHidden = true; sync(); };
  const show = () => { pageHidden = false; sync(); };
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  sync();
  return {
    dispose() {
      disposed = true;
      sync();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    },
  };
}

/** Text reads don't measure layout; avoid replacing an unchanged text node. */
export function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}
