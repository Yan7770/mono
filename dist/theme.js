(() => {
  'use strict';

  const storageKey = 'mono.theme';
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  let toggle;

  function applyTheme(preference) {
    const isDark = preference !== 'light';
    root.dataset.theme = isDark ? 'dark' : 'light';
    meta.content = isDark ? '#181818' : '#ffffff';
    toggle?.setAttribute('aria-checked', String(isDark));
  }

  let preference;
  try { preference = localStorage.getItem(storageKey); } catch {}
  applyTheme(preference);

  window.resetMonoTheme = () => {
    localStorage.removeItem(storageKey);
    applyTheme(null);
  };

  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.getElementById('menuTheme');
    toggle.setAttribute('aria-checked', String(root.dataset.theme === 'dark'));
    toggle.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(storageKey, next); } catch {}
    });
  }, { once: true });

  window.addEventListener('storage', event => {
    if (event.storageArea === localStorage && (event.key === storageKey || event.key === null)) {
      applyTheme(event.newValue);
    }
  });
})();
