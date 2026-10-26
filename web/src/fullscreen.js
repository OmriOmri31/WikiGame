export function enterFullscreen() {
  const element = document.documentElement;
  const request = element.requestFullscreen?.bind(element)
    || element.webkitRequestFullscreen?.bind(element);
  if (!request) return;
  try {
    const result = request();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // The browser can refuse fullscreen outside a user gesture.
  }
}

export function exitFullscreen() {
  const active = document.fullscreenElement || document.webkitFullscreenElement;
  if (!active) return;
  const exit = document.exitFullscreen?.bind(document)
    || document.webkitExitFullscreen?.bind(document);
  if (!exit) return;
  try {
    const result = exit();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Ignore browsers that already left fullscreen.
  }
}
