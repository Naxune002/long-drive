// Endless Drive loader — paste into the Safari console.
// Fetches endless-drive.js from GitHub and runs it.
(async () => {
  const urls = [
    'https://raw.githubusercontent.com/Naxune002/long-drive/main/endless-drive.js',
    'https://cdn.jsdelivr.net/gh/Naxune002/long-drive@main/endless-drive.js',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      (0, eval)(await res.text());
      return;
    } catch (e) {
      console.warn('Endless Drive: could not load from', url, e);
    }
  }
  // Last resort: script tag (works on pages that block fetch but allow scripts)
  const s = document.createElement('script');
  s.src = urls[1];
  s.onerror = () => console.error('Endless Drive: all sources failed (this page may block it — try a different tab).');
  document.head.appendChild(s);
})();
