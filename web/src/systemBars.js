// Keep the browser / Android navigation bar colour in step with the page
// background. Nothing navy is left once the app has rendered.
function pageColor() {
  const body = getComputedStyle(document.body).backgroundColor;
  if (body && body !== 'rgba(0, 0, 0, 0)' && body !== 'transparent') return body;
  return document.documentElement.dataset.theme === 'dark' ? '#000000' : '#ffffff';
}

export function syncSystemBars() {
  document.querySelectorAll('meta[name="theme-color"][media]').forEach((m) => m.remove());
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  let last = '';
  const update = () => {
    const color = pageColor();
    if (color !== last) {
      last = color;
      meta.content = color;
      document.documentElement.style.backgroundColor = color;
    }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class'],
    childList: true,
    subtree: true,
  });
  window.addEventListener('wiki-theme', schedule);
  update();
}
