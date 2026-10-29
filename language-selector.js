(() => {
  'use strict';
  const LANGUAGES = ['en', 'vi'];
  const LANGUAGE_META = {
    vi: { label: 'VI', flag: '🇻🇳', message: 'Tiếng Việt đang được chọn · Vietnamese selected' },
    en: { label: 'EN', flag: '🇬🇧', message: 'English is selected · Đang dùng tiếng Anh' }
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const controls = [...document.querySelectorAll('[data-language-control]')];
  if (!controls.length) return;
  let loaderPromise = null;
  let widgetRequested = false;
  let pendingLanguage = 'vi';

  function normalizeCode(code) {
    const value = String(code || '').trim().toLowerCase();
    return LANGUAGES.includes(value) ? value : 'vi';
  }
  function readSelectedCode() {
    const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
    if (match) {
      try {
        const parts = decodeURIComponent(match[1]).split('/').filter(Boolean);
        const code = parts.length > 1 ? parts[parts.length - 1] : '';
        if (LANGUAGES.includes(code.toLowerCase())) return code.toLowerCase();
      } catch (_) { /* Ignore malformed translation cookies. */ }
    }
    const selected = document.querySelector('.gt_selector');
    if (selected && LANGUAGES.includes(String(selected.value).toLowerCase())) return String(selected.value).toLowerCase();
    const current = document.querySelector('[data-gt-lang].gt-current-lang, .gt-current-lang[data-gt-lang]');
    const currentCode = current?.getAttribute('data-gt-lang')?.toLowerCase();
    return LANGUAGES.includes(currentCode) ? currentCode : 'vi';
  }
  function updateSelection(control, code) {
    const selected = normalizeCode(code);
    const meta = LANGUAGE_META[selected];
    const label = $('.language-toggle-label', control);
    const flag = $('.language-toggle-flag', control);
    if (label) label.textContent = meta.label;
    if (flag) flag.textContent = meta.flag;
    for (const option of control.querySelectorAll('[data-language-option]')) {
      const active = option.dataset.languageOption === selected;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-pressed', String(active));
    }
  }
  function feedback(control, message, state = 'ready') {
    const node = $('.language-feedback', control);
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
    const retry = $('.language-retry', control);
    if (retry) retry.hidden = state !== 'error';
  }
  function hidePanel(control) {
    const panel = $('.language-popover', control);
    const toggle = $('.language-toggle', control);
    if (!panel || panel.hidden) return;
    panel.classList.remove('is-open');
    panel.classList.add('is-closing');
    toggle?.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!panel.classList.contains('is-open')) {
        panel.hidden = true;
        panel.classList.remove('is-closing');
      }
    }, 440);
  }
  function openPanel(control) {
    for (const other of controls) if (other !== control) hidePanel(other);
    const panel = $('.language-popover', control);
    const toggle = $('.language-toggle', control);
    if (!panel) return;
    updateSelection(control, readSelectedCode());
    panel.hidden = false;
    panel.classList.remove('is-closing');
    toggle?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('is-open'));
  }
  function findWidget(widget) {
    if (!widget) return null;
    // Wait for the real select, not only the outer switcher shell, before enabling the custom cards.
    return widget.querySelector('select.gt_selector, select');
  }
  const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  async function waitForWidget(widget, timeout = 5500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ready = findWidget(widget);
      if (ready) return ready;
      await delay(100);
    }
    return null;
  }
  async function loadTranslator(control) {
    const widget = $('.gtranslate_wrapper', control);
    if (!widget) throw new Error('Language engine is missing.');
    const ready = findWidget(widget);
    if (ready) {
      widgetRequested = true;
      return widget;
    }
    if (loaderPromise) return loaderPromise;
    widgetRequested = true;
    feedback(control, 'Đang kết nối dịch vụ · Connecting translation service…', 'loading');
    window.gtranslateSettings = {
      default_language: 'vi',
      native_language_names: true,
      detect_browser_language: false,
      languages: LANGUAGES,
      wrapper_selector: '#languageTranslateWidget',
      alt_flags: { en: 'usa' }
    };
    loaderPromise = (async () => {
      const oldScript = document.querySelector('script[data-language-translator="gtranslate"]');
      if (oldScript) oldScript.remove();
      widget.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://cdn.gtranslate.net/widgets/latest/dropdown.js';
      script.async = true;
      script.dataset.languageTranslator = 'gtranslate';
      const loaded = new Promise((resolve, reject) => {
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', () => reject(new Error('Translation service could not be loaded.')), { once: true });
      });
      document.head.appendChild(script);
      await loaded;
      const node = await waitForWidget(widget);
      if (!node) {
        script.remove();
        throw new Error('Translation selector was not generated.');
      }
      return widget;
    })().catch(error => {
      loaderPromise = null;
      widgetRequested = false;
      throw error;
    });
    return loaderPromise;
  }
  async function applyLanguage(control, code) {
    const selected = normalizeCode(code);
    pendingLanguage = selected;
    const previous = readSelectedCode();
    updateSelection(control, selected);
    if (selected === previous) {
      feedback(control, LANGUAGE_META[selected].message, 'ready');
      window.setTimeout(() => hidePanel(control), 360);
      return;
    }
    feedback(control, selected === 'en' ? 'Đang chuyển sang English · Switching to English…' : 'Đang chuyển về Tiếng Việt · Switching to Vietnamese…', 'loading');
    try {
      const widget = await loadTranslator(control);
      const selector = widget.querySelector('select.gt_selector, select');
      if (!selector) throw new Error('Translation language choices are unavailable.');
      const option = [...selector.options].find(item => String(item.value).toLowerCase() === selected);
      if (!option) throw new Error('Selected language is not available in the translation service.');
      selector.value = option.value;
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      feedback(control, LANGUAGE_META[selected].message, 'ready');
      window.setTimeout(() => {
        const confirmed = readSelectedCode();
        if (confirmed === selected) updateSelection(control, confirmed);
        else updateSelection(control, selected);
        hidePanel(control);
      }, 900);
    } catch (error) {
      updateSelection(control, previous);
      feedback(control, 'Không thể tải bản dịch. Hãy kiểm tra Internet rồi thử lại. · Translation unavailable. Check your connection and retry.', 'error');
    }
  }
  controls.forEach(control => {
    const toggle = $('.language-toggle', control);
    const panel = $('.language-popover', control);
    const close = $('.language-close', control);
    const retry = $('.language-retry', control);
    toggle?.addEventListener('click', () => panel?.hidden ? openPanel(control) : hidePanel(control));
    close?.addEventListener('click', () => hidePanel(control));
    for (const option of control.querySelectorAll('[data-language-option]')) {
      option.addEventListener('click', () => applyLanguage(control, option.dataset.languageOption));
    }
    retry?.addEventListener('click', () => {
      loaderPromise = null;
      widgetRequested = false;
      const widget = $('.gtranslate_wrapper', control);
      if (widget) widget.innerHTML = '';
      applyLanguage(control, pendingLanguage);
    });
    const initialLanguage = readSelectedCode();
    updateSelection(control, initialLanguage);
    // The translation engine is lazy-loaded normally, but restore a user's saved English choice on later visits.
    if (initialLanguage === 'en') {
      loadTranslator(control).catch(() => feedback(control, 'Không tải được bản dịch đã lưu · Saved translation could not be restored. Check your connection.', 'error'));
    }
  });
  document.addEventListener('pointerdown', event => {
    for (const control of controls) {
      const panel = $('.language-popover', control);
      if (panel && !panel.hidden && !control.contains(event.target)) hidePanel(control);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') for (const control of controls) hidePanel(control);
  });
})();
