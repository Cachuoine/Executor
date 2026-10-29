(() => {
  'use strict';
  const LANGUAGES = ["en", "ar", "bg", "zh-CN", "zh-TW", "hr", "cs", "da", "nl", "fi", "fr", "de", "el", "hi", "it", "ja", "ko", "no", "pl", "pt", "ro", "ru", "es", "sv", "ca", "tl", "iw", "id", "lv", "lt", "sr", "sk", "sl", "uk", "vi", "sq", "et", "gl", "hu", "mt", "th", "tr", "fa", "af", "ms", "sw", "ga", "cy", "be", "is", "mk", "yi", "hy", "az", "eu", "ka", "ht", "ur", "bn", "bs", "ceb", "eo", "gu", "ha", "hmn", "ig", "jw", "kn", "km", "lo", "la", "mi", "mr", "mn", "ne", "pa", "so", "ta", "te", "yo", "zu", "my", "ny", "kk", "mg", "ml", "si", "st", "su", "tg", "uz", "am", "co", "haw", "ku", "ky", "lb", "ps", "sm", "gd", "sn", "sd", "fy", "xh"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const controls = [...document.querySelectorAll('[data-language-control]')];
  if (!controls.length) return;
  let loaderPromise = null;
  let widgetRequested = false;

  function codeToLabel(code) {
    return String(code || 'vi').replace(/^zh-CN$/i, 'ZH-CN').replace(/^zh-TW$/i, 'ZH-TW').split('-')[0].slice(0, 2).toUpperCase();
  }
  function setStatus(widget, message, failed = false) {
    if (!widget || widget.querySelector('.gt_selector, .gt_switcher, .gt_float_switcher, .gt_options, a')) return;
    widget.innerHTML = `<span class="language-loading${failed ? ' language-load-error' : ''}" role="status"></span>`;
    widget.querySelector('.language-loading').textContent = message;
    const control = widget.closest('[data-language-control]');
    const retry = control && $('.language-retry', control);
    if (retry) retry.hidden = !failed;
  }
  function readSelectedCode() {
    const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
    if (match) {
      const parts = decodeURIComponent(match[1]).split('/').filter(Boolean);
      if (parts.length > 1) return parts[parts.length - 1];
    }
    const selected = document.querySelector('.gt_selector');
    if (selected && selected.value) return selected.value;
    const current = document.querySelector('[data-gt-lang].gt-current-lang, .gt-current-lang[data-gt-lang]');
    return current?.getAttribute('data-gt-lang') || 'vi';
  }
  function refreshLabel(control) {
    const label = $('.language-toggle-label', control);
    if (label) label.textContent = codeToLabel(readSelectedCode());
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
    }, 190);
  }
  function openPanel(control) {
    for (const other of controls) if (other !== control) hidePanel(other);
    const panel = $('.language-popover', control);
    const toggle = $('.language-toggle', control);
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('is-closing');
    toggle?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    if (widgetRequested) refreshLabel(control);
  }
  function loadTranslator(control) {
    const widget = $('.gtranslate_wrapper', control);
    if (!widget) return;
    widgetRequested = true;
    setStatus(widget, 'Đang tải hơn 100 lựa chọn ngôn ngữ…');
    const retry = $('.language-retry', control);
    if (retry) retry.hidden = true;
    if (loaderPromise) return loaderPromise;

    window.gtranslateSettings = {
      default_language: 'vi',
      native_language_names: true,
      detect_browser_language: false,
      languages: LANGUAGES,
      wrapper_selector: '#languageTranslateWidget',
      alt_flags: { en: 'usa', pt: 'brazil' }
    };

    loaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.gtranslate.net/widgets/latest/dropdown.js';
      script.async = true;
      script.dataset.languageTranslator = 'gtranslate';
      script.onload = () => {
        window.setTimeout(() => {
          const hasWidget = widget.querySelector('.gt_selector, .gt_switcher, .gt_float_switcher, .gt_options, a');
          if (hasWidget) {
            widget.classList.remove('is-loading');
            const failed = $('.language-retry', control);
            if (failed) failed.hidden = true;
            refreshLabel(control);
            resolve();
          } else {
            setStatus(widget, 'Dịch vụ chưa tạo được danh sách. Hãy thử tải lại hoặc kiểm tra kết nối.', true);
            loaderPromise = null;
            reject(new Error('GTranslate did not render a language selector.'));
          }
        }, 1200);
      };
      script.onerror = () => {
        setStatus(widget, 'Không tải được dịch vụ ngôn ngữ. Hãy kiểm tra kết nối mạng rồi thử lại.', true);
        script.remove();
        loaderPromise = null;
        widgetRequested = false;
        reject(new Error('GTranslate script failed to load.'));
      };
      document.head.appendChild(script);
    }).catch(() => {});
    return loaderPromise;
  }

  controls.forEach(control => {
    const toggle = $('.language-toggle', control);
    const panel = $('.language-popover', control);
    const close = $('.language-close', control);
    const retry = $('.language-retry', control);
    const start = $('.language-start', control);
    start?.addEventListener('click', () => loadTranslator(control).catch(() => {}));
    toggle?.addEventListener('click', () => panel?.hidden ? openPanel(control) : hidePanel(control));
    close?.addEventListener('click', () => hidePanel(control));
    retry?.addEventListener('click', () => {
      widgetRequested = false;
      loaderPromise = null;
      const widget = $('.gtranslate_wrapper', control);
      if (widget) widget.innerHTML = '';
      loadTranslator(control);
    });
    const widget = $('.gtranslate_wrapper', control);
    widget?.addEventListener('change', event => {
      if (event.target.matches('select')) {
        const selected = String(event.target.value || 'vi');
        $('.language-toggle-label', control).textContent = codeToLabel(selected);
        window.setTimeout(() => { refreshLabel(control); hidePanel(control); }, 300);
      }
    });
    widget?.addEventListener('click', event => {
      const option = event.target.closest('[data-gt-lang], .gt_option');
      if (!option) return;
      const code = option.getAttribute('data-gt-lang') || option.getAttribute('data-gt-orig-url') || '';
      if (code) $('.language-toggle-label', control).textContent = codeToLabel(code);
      window.setTimeout(() => { refreshLabel(control); hidePanel(control); }, 450);
    });
    refreshLabel(control);
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
