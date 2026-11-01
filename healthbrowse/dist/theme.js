(() => {
  const key = 'healthbrowse-theme';
  const media = matchMedia('(prefers-color-scheme: dark)');
  function saved() {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  let preference = saved();
  function apply() {
    const dark = preference === 'dark' || (preference !== 'light' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#12221e' : '#f8f9f3');
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === (dark ? 'dark' : 'light')));
    });
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
      preference = button.dataset.mode;
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    }));
  });
  media.addEventListener('change', apply);
  addEventListener('storage', event => {
    if (event.key === key || event.key === null) { preference = saved(); apply(); }
  });
})();
