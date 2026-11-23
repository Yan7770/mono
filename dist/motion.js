(() => {
  'use strict';

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isReduced = () => reducedQuery.matches;

  const sliderRegistry = new WeakMap();
  const numberFormat = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function ensureSlider(container) {
    let slider = container.querySelector(':scope > .mono-slider');
    if (!slider) {
      slider = document.createElement('span');
      slider.className = 'mono-slider';
      slider.setAttribute('aria-hidden', 'true');
      container.prepend(slider);
    }
    container.classList.add('has-slider');
    return slider;
  }

  function syncSlider(container, target, { instant = false } = {}) {
    if (!container) return;
    const slider = ensureSlider(container);
    if (!target || target.offsetWidth === 0 || target.offsetHeight === 0) {
      slider.style.opacity = '0';
      return;
    }

    const firstPlacement = !slider.dataset.ready;
    const skipAnim = instant || firstPlacement || isReduced();
    if (skipAnim) slider.classList.add('is-instant');

    const left = target.offsetLeft;
    const top = target.offsetTop;
    const width = target.offsetWidth;
    const height = target.offsetHeight;

    slider.style.width = width + 'px';
    slider.style.height = height + 'px';
    slider.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    slider.style.opacity = '1';
    slider.dataset.ready = '1';

    if (skipAnim) {
      // Force layout commit so future updates animate cleanly from this geometry.
      void slider.offsetWidth;
      requestAnimationFrame(() => slider.classList.remove('is-instant'));
    }

    if (!sliderRegistry.has(container) && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        const active = container.querySelector('[aria-current="page"], [aria-pressed="true"]');
        if (active) syncSlider(container, active, { instant: true });
      });
      ro.observe(container);
      sliderRegistry.set(container, ro);
    }
  }

  const activeTweens = new WeakMap();

  function parseNumeric(text) {
    if (!text || /•/.test(text) || !/\d/.test(text)) return null;
    const normalized = String(text)
      .replace(/[¥￥,\s]/g, '')
      .replace(/−/g, '-');
    const match = normalized.match(/^[+-]?\d+(?:\.\d+)?/);
    if (!match) return null;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  }

  function cancelTween(node) {
    const id = activeTweens.get(node);
    if (id) {
      cancelAnimationFrame(id);
      activeTweens.delete(node);
    }
  }

  function tweenValue(node, from, to, renderFrame, duration = 340) {
    cancelTween(node);
    if (isReduced() || !Number.isFinite(from) || !Number.isFinite(to) || Math.abs(to - from) < 0.005) {
      renderFrame(to);
      return;
    }
    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      // Weighted ease-out quintic for Apple-Wallet-like calm settle.
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = from + (to - from) * eased;
      renderFrame(progress >= 1 ? to : current);
      if (progress < 1) {
        activeTweens.set(node, requestAnimationFrame(tick));
      } else {
        activeTweens.delete(node);
      }
    };
    activeTweens.set(node, requestAnimationFrame(tick));
  }

  function tweenNetHero(container, fromValue, toValue) {
    if (!container) return;
    const renderNet = val => {
      const sign = val < 0 ? '−' : '';
      const [whole, decimal] = numberFormat.format(Math.abs(val)).split('.');
      container.classList.toggle('long-balance', whole.length > 11);
      container.innerHTML =
        `<span class="unit">${sign}¥</span>` +
        `<span class="balance-amount">${whole}${decimal ? '<span class="decimals">.' + decimal + '</span>' : ''}</span>`;
    };
    tweenValue(container, fromValue, toValue, renderNet, 380);
  }

  function tweenSignedText(node, fromValue, toValue, { currency = '', forceSign = true, duration = 320 } = {}) {
    if (!node) return;
    const renderText = val => {
      const rounded = Math.round(val * 100) / 100;
      const sign = rounded === 0 ? '' : rounded > 0 ? (forceSign ? '+' : '') : '−';
      node.textContent = sign + currency + numberFormat.format(Math.abs(rounded));
    };
    tweenValue(node, fromValue, toValue, renderText, duration);
  }

  function tweenCurrencyText(node, fromValue, toValue, { prefix = '¥', duration = 300 } = {}) {
    if (!node) return;
    const renderText = val => {
      const rounded = Math.round(val * 100) / 100;
      const sign = rounded < 0 ? '−' : '';
      node.textContent = sign + prefix + numberFormat.format(Math.abs(rounded));
    };
    tweenValue(node, fromValue, toValue, renderText, duration);
  }

  function playPrivacyVeil(getNodes, onSwap) {
    const resolve = () => Array.from((typeof getNodes === 'function' ? getNodes() : getNodes) || []).filter(Boolean);
    const before = resolve();
    if (isReduced() || !before.length) {
      onSwap?.();
      return;
    }
    before.forEach(node => {
      node.classList.remove('privacy-veil-in');
      node.classList.add('privacy-veil-out');
    });
    window.setTimeout(() => {
      onSwap?.();
      const after = resolve();
      after.forEach(node => {
        node.classList.remove('privacy-veil-out');
        node.classList.add('privacy-veil-in');
        const clean = () => node.classList.remove('privacy-veil-in');
        node.addEventListener('animationend', clean, { once: true });
        window.setTimeout(clean, 340);
      });
    }, 115);
  }

  function closeDialog(dialog, returnValue) {
    if (!dialog || !dialog.open) return;
    if (dialog.dataset.closing === '1') return;
    if (isReduced()) {
      if (returnValue !== undefined) dialog.close(returnValue);
      else dialog.close();
      return;
    }
    dialog.dataset.closing = '1';
    dialog.classList.add('is-closing');

    let finished = false;
    const finalize = () => {
      if (finished) return;
      finished = true;
      dialog.classList.remove('is-closing');
      delete dialog.dataset.closing;
      if (dialog.open) {
        if (returnValue !== undefined) dialog.close(returnValue);
        else dialog.close();
      }
    };

    dialog.addEventListener('animationend', event => {
      if (event.target === dialog) finalize();
    }, { once: true });
    window.setTimeout(finalize, 280);
  }

  function bindDialogEscape(dialog, onBeforeClose) {
    if (!dialog || dialog.dataset.escapeBound === '1') return;
    dialog.dataset.escapeBound = '1';
    dialog.addEventListener('cancel', event => {
      if (isReduced()) return;
      event.preventDefault();
      onBeforeClose?.();
      closeDialog(dialog, 'cancel');
    });
  }

  function hideMenuAnimated(menu, button) {
    if (!menu || menu.hidden) return;
    if (button) button.setAttribute('aria-expanded', 'false');
    if (isReduced() || menu.dataset.closing === '1') {
      menu.hidden = true;
      menu.classList.remove('is-closing');
      delete menu.dataset.closing;
      return;
    }
    menu.dataset.closing = '1';
    menu.classList.add('is-closing');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      menu.hidden = true;
      menu.classList.remove('is-closing');
      delete menu.dataset.closing;
    };
    menu.addEventListener('animationend', finish, { once: true });
    window.setTimeout(finish, 220);
  }

  function showMenuAnimated(menu, button) {
    if (!menu) return;
    delete menu.dataset.closing;
    menu.classList.remove('is-closing');
    menu.hidden = false;
    if (button) button.setAttribute('aria-expanded', 'true');
  }

  function animateThemeSwitch(applyFn) {
    if (isReduced()) {
      applyFn();
      return;
    }
    const root = document.documentElement;
    root.classList.add('theme-transitioning');
    applyFn();
    window.setTimeout(() => root.classList.remove('theme-transitioning'), 300);
  }

  window.MonoMotion = {
    isReduced,
    syncSlider,
    parseNumeric,
    cancelTween,
    tweenNetHero,
    tweenSignedText,
    tweenCurrencyText,
    playPrivacyVeil,
    closeDialog,
    bindDialogEscape,
    hideMenuAnimated,
    showMenuAnimated,
    animateThemeSwitch
  };
})();
