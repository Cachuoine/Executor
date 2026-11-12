(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname) || location.hostname === '[::1]';
  const isGithubPages = location.hostname.endsWith('github.io');
  const apiUrl = (path) => new URL(path.replace(/^\//, ''), document.baseURI).toString();
  const state = { items: [], tracks: [], versions: null, downloads: {}, activePlatform: 'ALL', query: '', catalog: null, currentTrackId: '' };
  let manuallyCapturedSnapshotTime = null;
  let favoriteMusicTracks = [];
  let favoriteUniversePlayback = { trackId: '', isPlaying: false };
  window.addEventListener('executor:music-favorites-updated', event => { favoriteMusicTracks = Array.isArray(event.detail?.tracks) ? event.detail.tracks : []; renderFavoriteUniverse(); });
  window.addEventListener('executor:music-playback-state', event => {
    const detail = event.detail || {};
    syncFavoriteUniversePlayback(detail);
    const nextId = String(detail.trackId || '');
    const changedTrack = state.currentTrackId !== nextId;
    if (changedTrack) {
      state.currentTrackId = nextId;
      if (state.tracks.length) renderMusic(state.tracks);
    } else if (state.tracks.length) {
      // Keep the visible song row's glow in sync when a track pauses/resumes.
      renderMusic(state.tracks);
    }
    if (changedTrack && nextId) revealPublicMusicTrack(nextId);
  });
  let toastTimer;
  const PUBLIC_PLATFORMS = ['PC', 'macOS', 'Android', 'iOS'];
  const PLATFORM_SYMBOLS = { PC: 'PC', Android: 'A', iOS: 'i', macOS: 'M' };
  const PLATFORM_GLYPHS = {
    PC: '<rect class="glyph-frame" x="5" y="5" width="38" height="28" rx="4"/><path class="glyph-fill" d="M12 11h10v8H12zM25 11h11v8H25zM12 22h10v7H12zM25 22h11v7H25z"/><path class="glyph-frame" d="M18 41h12m-6-8v8"/>',
    macOS: '<rect class="glyph-frame" x="8" y="4" width="32" height="27" rx="3.5"/><path class="glyph-frame" d="M4 38h40l-4 5H8z"/><path class="glyph-fill" d="M24.1 15.4c-2.1-2.5-5.8-2.1-7.2.7-1.4 3.1.3 8.6 2.5 10.8 1.1 1.1 2.3.5 3.5 0 1.1-.5 2.1-.5 3.3 0 1.4.6 2.5 1 3.7-.1 2.2-2.2 3.8-7.7 2.4-10.7-1.4-2.9-5.2-3.3-7.2-.7z"/><path class="glyph-fill" d="M24.7 14.2c.1-2 1.7-3.4 3.8-3.7.1 2-1.5 3.5-3.8 3.7z"/>',
    Android: '<path class="glyph-frame" d="m15 10-3.5-5M33 10l3.5-5"/><path class="glyph-fill" d="M10 22a14 14 0 0 1 28 0H10zm2 3h24v10a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4zM7 25a2 2 0 0 1 4 0v8a2 2 0 0 1-4 0zm30 0a2 2 0 0 1 4 0v8a2 2 0 0 1-4 0zM17 38h5v6h-5zm9 0h5v6h-5z"/><path class="glyph-cut" d="M18 16h.1m11.8 0h.1"/>',
    iOS: '<rect class="glyph-frame" x="12" y="3" width="24" height="42" rx="5"/><path class="glyph-frame" d="M21 8h6"/><path class="glyph-fill" d="M24.1 20.5c-2.2-2.7-6.2-2.2-7.6.8-1.5 3.5.4 9.3 2.8 11.7 1.2 1.1 2.4.5 3.7 0 1.2-.5 2.3-.5 3.6.1 1.3.5 2.5 1.1 3.7-.1 2.4-2.4 4.2-8.2 2.8-11.7-1.4-3-5.2-3.5-7.6-.8z"/><path class="glyph-fill" d="M24.5 19.1c.1-2.1 1.9-3.6 4-3.8.1 2.1-1.6 3.6-4 3.8z"/>'
  };
  function platformIconMarkup(platform, className = 'platform-glyph') {
    const key = Object.prototype.hasOwnProperty.call(PLATFORM_GLYPHS, platform) ? platform : 'PC';
    return `<svg class="${className}" data-platform-icon="${key}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${PLATFORM_GLYPHS[key]}</svg>`;
  }
  const PLATFORM_LABELS = { PC: 'PC', Android: 'Android', iOS: 'iOS', macOS: 'macOS' };
  const MUSIC_GENRE_LABELS = { Pop: 'Nhạc Pop', Rock: 'Nhạc rock', 'Dance / EDM': 'Nhạc điện tử (EDM)', Remix: 'Phối lại (Remix)', 'Lo-fi': 'Nhạc Lo-fi', 'Hip-hop': 'Nhạc Hip-hop', 'R&B': 'Nhạc R&B', Jazz: 'Nhạc Jazz', Classical: 'Nhạc cổ điển', Soundtrack: 'Nhạc phim', Other: 'Khác', 'Pop Rock': 'Nhạc Pop rock', 'Synth-pop': 'Nhạc Synth-pop' };
  const STATUS_LABELS = { online: 'Đang hoạt động', offline: 'Gián đoạn', maintenance: 'Đang cập nhật', unknown: 'Chưa xác minh' };
  const SAFE_PROTOCOLS = new Set(['https:', 'http:']);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function safeUrl(value) {
    try {
      const u = new URL(String(value || ''), location.href);
      return SAFE_PROTOCOLS.has(u.protocol) ? u.href : '';
    } catch { return ''; }
  }
  // Signed Discord attachment URLs can expire. Prefer a cached/local copy when
  // supplied, otherwise fall back to the small brand image and finally a text mark.
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-image-fallback')) return;
    const fallbackUrl = String(image.dataset.fallbackUrl || '').trim();
    if (fallbackUrl && image.dataset.fallbackUsed !== '1') {
      image.dataset.fallbackUsed = '1';
      image.src = fallbackUrl;
      return;
    }
    const mode = image.dataset.fallbackMode || 'remove';
    if (mode === 'placeholder') {
      const placeholder = document.createElement('span');
      placeholder.className = image.dataset.fallbackClass || 'executor-name-brand-fallback';
      placeholder.textContent = image.dataset.fallbackText || '◈';
      image.replaceWith(placeholder);
      return;
    }
    const media = image.closest('.executor-card-media');
    if (mode === 'card-placeholder' && media) {
      const placeholder = document.createElement('div');
      placeholder.className = 'executor-card-media executor-card-media-placeholder';
      const mark = document.createElement('span');
      mark.className = 'executor-card-placeholder-icon';
      mark.textContent = image.dataset.fallbackText || '◈';
      const name = document.createElement('span');
      name.className = 'executor-card-placeholder-name';
      name.textContent = image.dataset.fallbackName || 'NightReaper';
      const caption = document.createElement('small');
      caption.textContent = 'NIGHTREAPER EXECUTOR ARCHIVE';
      placeholder.append(mark, name, caption);
      media.replaceWith(placeholder);
      return;
    }
    if (media) media.remove(); else image.remove();
  }, true);
  async function getJson(localPath, staticPath) {
    const urls = localHost ? [new URL(localPath.replace(/^\//, ''), location.origin + '/').href, apiUrl(staticPath)] : [apiUrl(staticPath)];
    let lastError;
    for (const rawUrl of urls) {
      const url = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}__refresh=${Date.now()}`;
      try {
        const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Yêu cầu dữ liệu thất bại (HTTP ${response.status}).`);
        return await response.json();
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Không thể tải dữ liệu.');
  }
  function showToast(message) {
    const node = $('#toast'); if (!node) return;
    node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2700);
  }
  function revealPublicMusicTrack(trackId) {
    const id = String(trackId || '');
    if (!id) return;
    // Dynamic selection must never navigate/scroll the main page to #music.
    // The Dynamic player already scrolls its own inner library to the active row.
    requestAnimationFrame(() => {
      const list = $('#musicSectionTrackList');
      const row = list ? [...list.querySelectorAll('[data-track-id]')].find(node => node.dataset.trackId === id) : null;
      if (!row) return;
      row.classList.remove('is-current-reveal');
      void row.offsetWidth;
      row.classList.add('is-current-reveal');
    });
  }

  function formatDate(value) {
    if (!value) return 'Chưa có thời gian cập nhật';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
  }
  function formatExactVietnamDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Không xác định';
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'long', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh'
    }).format(date);
  }
  function humanizeStatus(status) { return STATUS_LABELS[String(status || 'unknown').toLowerCase()] || 'Chưa xác định'; }
  function statusClass(status) {
    const s = String(status || 'unknown').toLowerCase();
    return ['online', 'offline', 'maintenance'].includes(s) ? `status-${s}` : 'status-unknown';
  }
  function compareExecutorNames(a, b) {
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'vi', { sensitivity: 'base', numeric: true })
      || String(a?.id || '').localeCompare(String(b?.id || ''), 'vi', { sensitivity: 'base', numeric: true });
  }
  function getFilteredItems() {
    const q = state.query.trim().toLowerCase();
    return state.items.filter((item) => {
      if (!PUBLIC_PLATFORMS.includes(item.platform)) return false;
      if (state.activePlatform !== 'ALL' && item.platform !== state.activePlatform) return false;
      if (!q) return true;
      return [item.name, item.platform, item.pcCategory, item.status, item.version, item.compatibilityVersion, item.summary].some((x) => String(x || '').toLowerCase().includes(q));
    }).sort(compareExecutorNames);
  }
  function getCounts(items = state.items) {
    const visibleItems = items.filter(item => PUBLIC_PLATFORMS.includes(item.platform));
    const result = { ALL: visibleItems.length, PC: 0, Android: 0, iOS: 0, macOS: 0 };
    for (const item of visibleItems) if (Object.hasOwn(result, item.platform)) result[item.platform]++;
    return result;
  }
  function scoreBadgesMarkup(item, className = 'executor-score-badges') {
    const suncUrl = safeUrl(item?.suncUrl ?? item?.sUNCUrl);
    return [['sUNC', item?.sunc ?? item?.sUNC, suncUrl], ['UNC', item?.unc ?? item?.UNC, '']]
      .map(([label, rawValue, url]) => {
        const hasValue = String(rawValue ?? '').trim() !== '';
        const value = hasValue ? String(rawValue).trim() : '—';
        const stateClass = hasValue ? 'is-available' : 'is-unavailable';
        const content = `<b>${label}</b><span>${escapeHtml(value)}</span>${label === 'sUNC' && url && hasValue ? '<span class="score-link-mark" aria-hidden="true">↗</span>' : ''}`;
        if (label === 'sUNC' && url && hasValue) return `<a class="executor-score-badge ${label.toLowerCase()} ${stateClass} sunc-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Mở liên kết sUNC" aria-label="Mở liên kết sUNC cho ${escapeHtml(item?.name || 'executor')}">${content}</a>`;
        return `<span class="executor-score-badge ${label.toLowerCase()} ${stateClass}" title="${hasValue ? `${label}: ${escapeHtml(value)}` : `${label}: Chưa có dữ liệu`}">${content}</span>`;
      })
      .join('');
  }
  function cardMarkup(item, index) {
    const iconUrl = safeUrl(item.thumbImageUrl);
    const mainImageUrl = safeUrl(item.websiteMainImageUrl) || iconUrl;
    const pcCategoryLabels = { paid: 'Trả phí', free: 'Miễn phí', internal: 'External', external: 'External' };
    const platformCategory = item.platform === 'PC' && item.pcCategory
      ? `PC / ${pcCategoryLabels[item.pcCategory] || item.pcCategory}`
      : (PLATFORM_LABELS[item.platform] || item.platform || 'Chưa phân loại');
    const icon = iconUrl
      ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback data-fallback-mode="placeholder" data-fallback-text="${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}" data-fallback-class="executor-name-brand-fallback">`
      : escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈');
    const nameBrand = iconUrl
      ? `<img class="executor-name-brand-image" src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback data-fallback-mode="placeholder" data-fallback-text="${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}" data-fallback-class="executor-name-brand-fallback">`
      : `<span class="executor-name-brand-fallback">${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}</span>`;
    const status = `<span class="executor-name-status ${statusClass(item.status)}" title="${escapeHtml(humanizeStatus(item.status))}"><i aria-hidden="true"></i>${escapeHtml(humanizeStatus(item.status))}</span>`;
    const cardImage = mainImageUrl
      ? `<div class="executor-card-media"><img class="executor-card-image" src="${escapeHtml(mainImageUrl)}" ${iconUrl && iconUrl !== mainImageUrl ? `data-fallback-url="${escapeHtml(iconUrl)}"` : ''} data-image-fallback data-fallback-mode="card-placeholder" data-fallback-name="${escapeHtml(item.name || 'NightReaper')}" data-fallback-text="${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}" alt="${escapeHtml(item.name || 'executor')}" loading="lazy" referrerpolicy="no-referrer" onload="if(this.naturalHeight && this.naturalWidth / this.naturalHeight < 1.55) this.classList.add('is-contained')"><span class="executor-card-image-shade" aria-hidden="true"></span></div>`
      : `<div class="executor-card-media executor-card-media-placeholder"><span class="executor-card-placeholder-icon">${icon}</span><span class="executor-card-placeholder-name">${escapeHtml(item.name || 'NightReaper')}</span><small>NIGHTREAPER EXECUTOR ARCHIVE</small></div>`;
    const favoriteId = itemFavoriteKey(item); const isFavorite = getFavoriteIds().has(favoriteId);
    const scoreMarkup = scoreBadgesMarkup(item);
    return `<article class="executor-card ${isFavorite ? 'is-favorite' : ''}" style="animation-delay:${Math.min(index, 10) * 35}ms"><div class="executor-card-body"><button class="executor-favorite" type="button" data-favorite="${escapeHtml(favoriteId)}" aria-label="${isFavorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}" aria-pressed="${isFavorite}" title="${isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="executor-heart-base" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/><path class="executor-heart-facet" d="M5.1 6.1a3.7 3.7 0 0 1 5.2 0L12 7.8l1.7-1.7a3.7 3.7 0 0 1 4.5-.5l-6.4 7.1-6.7-6.6Z"/></svg></button>${cardImage}<div class="executor-product-copy"><div class="executor-product-heading"><div class="executor-name-line">${nameBrand}<h3>${escapeHtml(item.name || 'Mục chưa đặt tên')}</h3>${status}</div></div><div class="executor-score-line">${scoreMarkup}</div><span class="executor-product-platform">${escapeHtml(platformCategory)}</span><div class="executor-product-foot"><span class="executor-product-version">VERSION · ${escapeHtml(item.version || 'Chưa có thông tin')}</span><button type="button" data-detail="${escapeHtml(item.id || '')}">Chi tiết <span>↗</span></button></div></div></div></article>`;
  }
  function renderCatalog() {
    // Favorites remain marked as favorites, but never break the guaranteed A–Z catalogue order.
    const filtered = getFilteredItems();
    const grid = $('#executorGrid');
    $('#catalogResultLabel').textContent = `${filtered.length} ${filtered.length === 1 ? 'mục' : 'mục'}${state.query || state.activePlatform !== 'ALL' ? ' khớp bộ lọc' : ' trong danh mục'}`;
    if (!filtered.length) {
      const filteredSearch = Boolean(state.query || state.activePlatform !== 'ALL');
      grid.innerHTML = `<div class="empty-state"><strong>${filteredSearch ? 'Không tìm thấy mục phù hợp.' : 'Danh mục đang chờ mục đầu tiên.'}</strong><p>${filteredSearch ? 'Thử từ khóa khác hoặc chọn nền tảng khác.' : 'Chưa có executor nào được xuất bản. Hãy thêm mục trong Admin localhost rồi xuất bản dữ liệu lên GitHub Pages.'}</p>${localHost && !filteredSearch ? '<a class="button button-primary" href="/admin">Thêm mục trong Admin ↗</a>' : ''}</div>`;
    } else grid.innerHTML = filtered.map(cardMarkup).join('');
    const counts = getCounts();
    $('#allCount').textContent = counts.ALL;
    for (const platform of PUBLIC_PLATFORMS) {
      const el = $(`#platform${platform}`);
      if (el) el.textContent = `${counts[platform]} ${counts[platform] === 1 ? 'mục' : 'mục'}`;
    }
    $$('.filter-chip').forEach((button) => {
      const active = button.dataset.platform === state.activePlatform;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
      const count = counts[button.dataset.platform];
      const span = $('span', button); if (span && Number.isFinite(count)) span.textContent = count;
    });
    renderFavoriteUniverse();
  }
  function renderStats(catalog) {
    const items = state.items;
    $('#statTotal').textContent = String(items.length).padStart(2, '0');
    $('#statOnline').textContent = String(items.filter((x) => String(x.status).toLowerCase() === 'online').length).padStart(2, '0');
    $('#statTotalHint').textContent = items.length ? `${items.length} mục đã được đăng` : 'Đang chờ mục đầu tiên được xuất bản';
    $('#heroCardCount').innerHTML = `${items.length.toString().padStart(2, '0')} <span>mục đã xuất bản</span>`;
    const snapshotLabel = $('#lastUpdatedLabel');
    const snapshotValue = $('#lastUpdated');
    if (manuallyCapturedSnapshotTime) {
      if (snapshotLabel) snapshotLabel.textContent = 'THỜI ĐIỂM BẠN NHẤN';
      if (snapshotValue) snapshotValue.textContent = formatExactVietnamDateTime(manuallyCapturedSnapshotTime);
    } else {
      if (snapshotLabel) snapshotLabel.textContent = 'BẢN CHỤP DỮ LIỆU';
      if (snapshotValue) snapshotValue.textContent = catalog?.updatedAt ? formatDate(catalog.updatedAt) : 'Đang chờ bản dữ liệu đầu tiên';
    }
  }
  function renderVersionData(data) {
    const value = data?.data || null;
    const versions = value?.versions && typeof value.versions === 'object' ? value.versions : {};
    const mainVersion = versions.PC?.version || versions.macOS?.version || versions.Android?.version || versions.iOS?.version || value?.version || value?.WindowsPlayer || value?.windows || value?.PC || value?.clientVersion || value?.versionHash || '';
    const timestamp = value?.fetchedAt || value?.updatedAt || value?.updated_at || value?.timestamp || '';
    const hasVersion = Object.values(versions).some((row) => row && row.version) || Boolean(mainVersion);
    $('#versionSourceBadge').textContent = hasVersion ? 'Có dữ liệu' : 'Đang chờ nguồn dữ liệu';
    $('#heroMiniVersion').textContent = mainVersion ? `Bản dựng ${mainVersion}` : 'Nguồn phiên bản';
    const box = $('#versionMain');
    if (hasVersion && Object.keys(versions).length) {
      const rows = ['PC', 'macOS', 'Android', 'iOS'].map((key) => {
        const row = versions[key] || {};
        const versionLabel = ({ PC: 'Windows / Máy tính', macOS: 'macOS', Android: 'Android', iOS: 'iOS' })[key] || row.label || key;
        return `<div class="version-mini"><div class="version-mini-heading">${platformIconMarkup(key)}<small>${escapeHtml(versionLabel)}</small><i>${escapeHtml(key === 'PC' ? '01' : key === 'macOS' ? '02' : key === 'Android' ? '03' : '04')}</i></div><strong>${escapeHtml(row.version || 'Chưa cung cấp')}</strong><span>${row.updatedAt ? `Cập nhật ${escapeHtml(formatDate(row.updatedAt))}` : 'Chưa có ngày'}</span></div>`;
      }).join('');
      box.innerHTML = `<div class="version-version-grid">${rows}</div>`;
      $('#versionLastUpdated').textContent = timestamp ? `Lấy bản chụp lúc ${formatDate(timestamp)}` : 'Bản chụp nguồn không có thời gian lấy dữ liệu';
    } else if (mainVersion) {
      box.innerHTML = `<div class="version-build"><strong>${escapeHtml(mainVersion)}</strong><span>Phiên bản ứng dụng hiện tại trong bản dữ liệu đã lưu</span></div>`;
      $('#versionLastUpdated').textContent = timestamp ? `Cập nhật ${formatDate(timestamp)}` : 'Nguồn dữ liệu chưa cung cấp thời gian cập nhật';
    } else {
      box.innerHTML = `<div class="version-build"><strong>Chưa có thông tin phiên bản</strong><span>Bản chụp đã lưu chưa có phiên bản hiện tại để hiển thị. Các liên kết tải vẫn khả dụng.</span></div>`;
      $('#versionLastUpdated').textContent = 'Bản chụp hiện tại không có thời gian phiên bản';
    }
    const downloads = data?.downloads || {};
    const fallback = {
      PC: { label: 'Windows / RDD', url: 'https://rdd.whatexpsare.online/?binaryType=WindowsPlayer&channel=LIVE' },
      macOS: { label: 'macOS / RDD', url: 'https://rdd.whatexpsare.online/?binaryType=MacPlayer&channel=LIVE' },
      Android: { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.roblox.client' },
      iOS: { label: 'App Store', url: 'https://apps.apple.com/app/roblox/id431946152' }
    };
    const list = Object.keys(fallback).map((key) => {
      const item = downloads[key] || fallback[key]; const url = safeUrl(item.url || fallback[key].url); if (!url) return '';
      const deviceIcon = platformIconMarkup(key, 'platform-glyph');
      return `<a class="download-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="download-device" data-device="${escapeHtml(key)}">${deviceIcon}</span><span><b>${escapeHtml(key)}</b><small>${escapeHtml(item.label || fallback[key].label)}</small></span><i>↗</i></a>`;
    }).join('');
    $('#downloadLinks').innerHTML = list || '<span class="loading-text">Chưa có liên kết tải an toàn.</span>';
  }
  // Local uploads and external HTTP(S) URLs are kept in the public library.
  // A generic web page is accepted as a source, but only browser-compatible audio
  // endpoints can actually play through the page's audio element.
  function isDirectAudioTrack(track) {
    if (!track || track.videoId || !['audio', 'external', 'link'].includes(String(track.sourceType || ''))) return false;
    try {
      const url = new URL(String(track.url || ''), document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
      return true;
    } catch { return false; }
  }
  function isPlayableTrack(track) { return isDirectAudioTrack(track); }
  function renderMusic(tracks) {
    state.tracks = Array.isArray(tracks) ? tracks.filter(isDirectAudioTrack) : [];
    $('#musicCount').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'bài hát' : 'bài hát'} trong thư viện`;
    $('#musicEmpty').hidden = state.tracks.length > 0;
    if (!state.tracks.length) { $('#musicSectionTrackList').innerHTML = '<div class="loading-text">Thư viện nhạc trống. Hãy thêm bài hát trong Admin localhost để hiển thị tại đây.</div>'; return; }
    const topTracks = state.tracks.slice(0, 10);
    const activeTrack = state.tracks.find(track => String(track.id) === String(state.currentTrackId));
    if (activeTrack && !topTracks.some(track => String(track.id) === String(activeTrack.id))) topTracks.splice(9, 1, activeTrack);
    $('#musicSectionTrackList').innerHTML = topTracks.map((track, i) => {
      const playable = isPlayableTrack(track);
      const playing = state.currentTrackId === String(track.id);
      const audioTag = track.sourceType === 'external' ? ' <em class="music-source-tag">URL</em>' : ' <em class="music-source-tag">MP3</em>';
      return `<div class="music-track${playing ? ' is-playing is-current-track' : ''}" data-track-id="${escapeHtml(track.id || '')}"><div class="track-main"><span class="track-number">${String(i + 1).padStart(2, '0')}</span><span class="track-art">♫</span><span class="track-info"><b>${escapeHtml(track.title || 'Bài hát chưa có tên')}${audioTag}</b><small>${escapeHtml(track.artist || 'Nghệ sĩ chưa rõ')}</small></span></div><span class="track-genre">${escapeHtml(MUSIC_GENRE_LABELS[track.genre] || track.genre || 'Chưa phân loại')}</span><button class="track-play${playing ? ' is-active' : ''}" type="button" data-play-track="${escapeHtml(track.id || '')}" ${playable ? '' : 'disabled'} aria-label="Phát ${escapeHtml(track.title || 'bài hát')}">${playing ? 'Đang phát' : 'Phát'} <span>▶</span></button></div>`;
    }).join('');
  }
  function playTrack(id) {
    const track = state.tracks.find(row => String(row.id) === String(id));
    if (!track) { showToast('Bài hát này không còn trong thư viện hiện tại.'); return; }
    if (!isPlayableTrack(track)) { showToast('Nguồn nhạc này chưa được hỗ trợ hoặc liên kết không hợp lệ.'); return; }
    state.currentTrackId = String(track.id);
    renderMusic(state.tracks);
    window.dispatchEvent(new CustomEvent('executor:music-play', { detail: { id: String(track.id) } }));
    const dock = $('#musicDock');
    if (dock) dock.classList.add('is-playing');
    showToast(`Đang phát: ${track.title || 'Bài hát'}`);
  }
  function stopTrack() {
    state.currentTrackId = '';
    renderMusic(state.tracks);
    window.dispatchEvent(new CustomEvent('executor:music-stop'));
  }
  function openDetails(id) {
    const item = state.items.find((row) => String(row.id) === String(id) || itemFavoriteKey(row) === String(id));
    if (!item) { showToast('Không tìm thấy mục này trong bản dữ liệu hiện tại.'); return; }
    const mainImage = safeUrl(item.websiteMainImageUrl) || safeUrl(item.thumbImageUrl);
    const website = safeUrl(item.websiteUrl);
    const community = safeUrl(item.communityUrl);
    const source = safeUrl(item.sourceUrl);
    const iconUrl = safeUrl(item.thumbImageUrl);
    const icon = iconUrl ? `<span class="executor-icon"><img src="${escapeHtml(iconUrl)}" alt="" referrerpolicy="no-referrer" data-image-fallback data-fallback-mode="placeholder" data-fallback-text="${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}" data-fallback-class="executor-name-brand-fallback"></span>` : `<span class="executor-icon">${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}</span>`;
    const image = mainImage ? `<img class="detail-cover" src="${escapeHtml(mainImage)}" ${iconUrl && iconUrl !== mainImage ? `data-fallback-url="${escapeHtml(iconUrl)}"` : ''} data-image-fallback alt="${escapeHtml(item.name || 'Executor')} ảnh xem trước" loading="lazy" referrerpolicy="no-referrer">` : '';
    const actionIcon = {
      website: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg>',
      community: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>',
      source: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8"/></svg>'
    };
    const actions = [[website, 'website', 'Mở website', ''], [community, 'community', 'Cộng đồng', 'secondary'], [source, 'source', 'Nguồn', 'secondary']].filter(([url]) => url).map(([url, kind, label, klass]) => `<a class="detail-action ${klass}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${actionIcon[kind]}<span>${label}</span></a>`).join('');
    const platformLabel = PLATFORM_LABELS[item.platform] || item.platform || 'NỀN TẢNG';
    const pcCategoryLabel = item.pcCategory ? `${({paid:'Trả phí',free:'Miễn phí',internal:'External',external:'External'})[item.pcCategory] || item.pcCategory} · ` : '';
    const summaryMarkup = window.DiscordDescription?.renderExecutorChangelog
      ? window.DiscordDescription.renderExecutorChangelog(item)
      : (window.DiscordDescription ? window.DiscordDescription.render(item.summary || 'Mục này chưa có mô tả.') : escapeHtml(item.summary || 'Mục này chưa có mô tả.'));
    $('#detailContent').innerHTML = `<div class="detail-content">${image}<div class="detail-title-row">${icon}<div class="detail-title-copy"><div class="detail-title-primary"><span class="section-tag">${escapeHtml(platformLabel)}</span><h2 id="detailTitle">${escapeHtml(item.name || 'Mục chưa đặt tên')}</h2><div class="detail-score-badges">${scoreBadgesMarkup(item, 'detail-score-badges')}</div></div><p>${escapeHtml(pcCategoryLabel)}${escapeHtml(humanizeStatus(item.status))}</p></div></div><div class="detail-description-block discord-embed-mock catalog-detail-preview"><div class="discord-embed-mock-main"><div class="discord-embed-mock-description catalog-preview-description discord-description-rendered">${summaryMarkup}</div></div></div><div class="detail-kv"><div><small>PHIÊN BẢN</small><strong>${escapeHtml(item.version || 'Chưa có thông tin')}</strong></div><div><small>TƯƠNG THÍCH</small><strong>${escapeHtml(item.compatibilityVersion || 'Chưa xác định')}</strong></div><div><small>CẬP NHẬT LẦN CUỐI</small><strong>${escapeHtml(item.updatedAt ? formatDate(item.updatedAt) : 'Chưa cung cấp')}</strong></div><div><small>NỀN TẢNG</small><strong>${escapeHtml(platformLabel)}</strong></div></div><div class="detail-actions">${actions || '<span class="loading-text">Mục này chưa có liên kết bên ngoài.</span>'}</div></div>`;
    const dialog = $('#detailDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', 'open');
  }
  function enableNavigation() {
    $('#mobileMenuToggle')?.addEventListener('click', () => {
      const nav = $('.main-nav'); const open = nav.classList.toggle('open');
      $('#mobileMenuToggle').setAttribute('aria-expanded', String(open));
      $('#mobileMenuToggle').setAttribute('aria-label', open ? 'Đóng điều hướng' : 'Mở điều hướng');
    });
    $$('.main-nav a').forEach((link) => link.addEventListener('click', () => { $('.main-nav').classList.remove('open'); $('#mobileMenuToggle').setAttribute('aria-expanded', 'false'); }));
    const catalogSearchForm = $('#catalogSearchForm');
    const catalogSearchToggle = $('#catalogSearchToggle');
    const catalogSearch = $('#catalogSearch');
    const heroSearch = $('#heroSearch');
    function setCatalogSearchOpen(open, { clear = false, focus = true } = {}) {
      if (!catalogSearchForm || !catalogSearchToggle || !catalogSearch) return;
      catalogSearchForm.classList.toggle('is-open', Boolean(open));
      catalogSearchToggle.setAttribute('aria-expanded', String(Boolean(open)));
      catalogSearchToggle.setAttribute('aria-label', open ? 'Đóng tìm kiếm danh mục' : 'Mở tìm kiếm danh mục');
      catalogSearch.tabIndex = open ? 0 : -1;
      if (open && focus) requestAnimationFrame(() => catalogSearch.focus({ preventScroll:true }));
      if (!open && clear) {
        const hadQuery = Boolean(catalogSearch.value || state.query || heroSearch?.value);
        catalogSearch.value = '';
        if (heroSearch) heroSearch.value = '';
        state.query = '';
        if (hadQuery) renderCatalog();
      }
    }
    catalogSearchToggle?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (catalogSearchForm?.classList.contains('is-open')) setCatalogSearchOpen(false, { clear:true, focus:false });
      else setCatalogSearchOpen(true);
    });
    catalogSearchForm?.addEventListener('click', event => event.stopPropagation());
    catalogSearch?.addEventListener('keydown', event => {
      if (event.key === 'Escape' && catalogSearchForm?.classList.contains('is-open')) {
        event.preventDefault(); event.stopPropagation(); setCatalogSearchOpen(false, { clear:true, focus:false }); catalogSearchToggle?.focus({ preventScroll:true });
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!catalogSearchForm?.classList.contains('is-open')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && (catalogSearchForm.contains(target) || target.closest('#catalogSearchForm') || target.closest('#executorGrid') || target.closest('#heroSearchForm'))) return;
      setCatalogSearchOpen(false, { clear:true, focus:false });
    }, true);
    $('#heroSearchForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      state.query = String(heroSearch?.value || '').trim();
      if (catalogSearch) catalogSearch.value = state.query;
      if (state.query) setCatalogSearchOpen(true, { focus:false });
      state.activePlatform = 'ALL'; renderCatalog(); $('#catalog').scrollIntoView({ behavior: 'smooth' });
    });
    heroSearch?.addEventListener('input', () => {
      if (catalogSearch) catalogSearch.value = heroSearch.value;
      state.query = heroSearch.value;
      if (state.query) setCatalogSearchOpen(true, { focus:false });
      renderCatalog();
    });
    catalogSearch?.addEventListener('input', () => {
      state.query = catalogSearch.value;
      if (heroSearch) heroSearch.value = state.query;
      renderCatalog();
    });
    $('#platformFilters')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-platform]'); if (!button) return;
      state.activePlatform = button.dataset.platform; renderCatalog();
    });
    document.addEventListener('click', (event) => {
      const detail = event.target.closest('[data-detail]'); if (detail) openDetails(detail.dataset.detail);
      const play = event.target.closest('[data-play-track]'); if (play && !play.disabled) playTrack(play.dataset.playTrack);
      const jump = event.target.closest('[data-jump-platform]'); if (jump) {
        state.activePlatform = jump.dataset.jumpPlatform; renderCatalog();
      }
    });
    $('#detailDialog')?.addEventListener('click', (event) => { if (event.target === $('#detailDialog')) $('#detailDialog').close(); });
    // Canonical section URLs: empty fragments and the legacy #top are always normalized to #home.
    // A reload/reset starts at Home; while scrolling, the hash follows the visible section.
    const sectionKeys = ['home', 'catalog', 'versions', 'music'];
    const navLinks = [...new Set($$('.main-nav-dynamic [data-main-nav], .main-nav-dynamic a[href*="#"], [data-section-nav]'))];
    const normalizeSectionKey = value => {
      const key = String(value ?? '').trim().replace(/^#/, '');
      return !key || key === 'top' ? 'home' : key;
    };
    const sectionKeyForLink = link => {
      const explicit = normalizeSectionKey(link.dataset.sectionNav || link.dataset.mainNav || '');
      const href = link.getAttribute('href') || '';
      const rawHash = href.includes('#') ? href.slice(href.lastIndexOf('#') + 1) : '';
      const hash = normalizeSectionKey(rawHash);
      if (sectionKeys.includes(hash) && document.getElementById(hash)) return hash;
      if (sectionKeys.includes(explicit) && document.getElementById(explicit)) return explicit;
      if (rawHash && document.getElementById(rawHash)) return normalizeSectionKey(rawHash);
      return explicit;
    };
    let navScrollQueued = false;
    const setActiveSection = key => {
      navLinks.forEach(link => {
        const active = sectionKeyForLink(link) === key;
        link.classList.toggle('active', active);
        if (active) {
          link.setAttribute('aria-current', 'location');
          if (link.matches('button[data-admin-tab]')) link.setAttribute('aria-selected', 'true');
        } else {
          link.removeAttribute('aria-current');
          if (link.matches('button[data-admin-tab]')) link.setAttribute('aria-selected', 'false');
        }
      });
    };
    const setSectionHash = key => {
      const canonicalKey = sectionKeys.includes(key) ? key : 'home';
      const nextUrl = new URL(window.location.href);
      nextUrl.hash = canonicalKey; // Assigning a real key prevents a trailing bare "#".
      const nextAddress = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentAddress = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentAddress !== nextAddress) window.history.replaceState(window.history.state, '', nextAddress);
    };
    const scrollToHomeTop = () => {
      const rootStyle = document.documentElement.style;
      const previousScrollBehavior = rootStyle.scrollBehavior;
      rootStyle.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      rootStyle.scrollBehavior = previousScrollBehavior;
    };
    const updateActiveNavFromScroll = () => {
      navScrollQueued = false;
      const readingLine = Math.max(115, Math.min(260, window.innerHeight * 0.30));
      let activeKey = 'home';
      for (const key of sectionKeys) {
        const section = document.getElementById(key);
        if (section && section.getBoundingClientRect().top <= readingLine) activeKey = key;
      }
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
        activeKey = sectionKeys[sectionKeys.length - 1];
      }
      setActiveSection(activeKey);
      setSectionHash(activeKey);
    };
    const queueActiveNavUpdate = () => {
      if (navScrollQueued) return;
      navScrollQueued = true;
      window.requestAnimationFrame(updateActiveNavFromScroll);
    };
    navLinks.forEach(link => link.addEventListener('click', () => {
      const key = sectionKeyForLink(link);
      if (sectionKeys.includes(key)) {
        setActiveSection(key);
        setSectionHash(key);
      }
      queueActiveNavUpdate();
    }));
    window.addEventListener('scroll', queueActiveNavUpdate, { passive: true });
    window.addEventListener('resize', queueActiveNavUpdate, { passive: true });
    window.addEventListener('hashchange', () => {
      const rawHash = window.location.hash;
      const key = normalizeSectionKey(rawHash);
      if (!rawHash || !sectionKeys.includes(key)) {
        setSectionHash('home');
        setActiveSection('home');
        scrollToHomeTop();
        return;
      }
      setActiveSection(key);
      queueActiveNavUpdate();
    });
    // Disable browser scroll restoration so F5/Ctrl+R cannot reopen an old tab position.
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const startsAtCanonicalHome = window.location.hash === '#home';
    setSectionHash('home');
    if (!startsAtCanonicalHome || window.scrollY > 0) scrollToHomeTop();
    setActiveSection('home');
    updateActiveNavFromScroll();
    document.addEventListener('keydown', (event) => {
      if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        event.preventDefault(); $('#heroSearch').focus();
      }
      if (event.key === 'Escape') { $('#mobileMenuToggle').setAttribute('aria-expanded', 'false'); $('.main-nav').classList.remove('open'); }
    });
  }
  function revealOnScroll() {
    const nodes = $$('.reveal');
    if (!('IntersectionObserver' in window)) { nodes.forEach((n) => n.classList.add('visible')); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: .08, rootMargin: '0px 0px -20px 0px' });
    nodes.forEach((node) => observer.observe(node));
  }

  const FAVORITES_KEY = 'executor-favorite-ids-v1';
  const MAX_FAVORITES = 8;
  function getFavoriteIds() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      const raw = Array.isArray(stored) ? stored.map(String) : [];
      const normalized = [...new Set(raw.filter(Boolean))].slice(0, MAX_FAVORITES);
      // Repair older browser storage that may already contain more than eight favorites.
      if (JSON.stringify(raw) !== JSON.stringify(normalized)) localStorage.setItem(FAVORITES_KEY, JSON.stringify(normalized));
      return new Set(normalized);
    } catch { return new Set(); }
  }
  function itemFavoriteKey(item) { return String(item.id || item.slug || item.name || ''); }
  function toggleFavorite(id) {
    const key = String(id);
    const favorites = getFavoriteIds();
    if (favorites.has(key)) favorites.delete(key);
    else {
      if (favorites.size >= MAX_FAVORITES) {
        showToast('Bạn đã đạt giới hạn 8 executor yêu thích. Hãy bỏ yêu thích một mục trước.');
        return;
      }
      favorites.add(key);
    }
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch {}
    renderCatalog();
  }

  const UNIVERSE_ORBITS = [
    { rx: .46, ry: .22, rotation: -17, speed: .46 },
    { rx: .37, ry: .31, rotation: 36, speed: -.34 },
    { rx: .45, ry: .125, rotation: 4, speed: .4 }
  ];
  let universeVisible = false;
  let universeAnimationFrame = 0;
  let universeLastFrame = 0;
  const reducedOrbitMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;

  function renderFingerprintWingLists(executorFavorites) {
    const executorRoot = $('#fingerprintFavoriteExecutors');
    const musicRoot = $('#fingerprintFavoriteMusic');
    if (executorRoot) {
      executorRoot.innerHTML = executorFavorites.length ? executorFavorites.map(item => {
        const iconUrl = safeUrl(item.thumbImageUrl);
        const icon = iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback data-fallback-mode="placeholder" data-fallback-text="${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}" data-fallback-class="executor-name-brand-fallback">` : `<span>${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}</span>`;
        const key = String(item.id || itemFavoriteKey(item));
        return `<button class="fingerprint-wing-favorite" type="button" data-detail="${escapeHtml(key)}" title="Xem thông tin ${escapeHtml(item.name || 'Executor')}"><span class="fingerprint-wing-icon">${icon}</span><span class="fingerprint-wing-copy"><b>${escapeHtml(item.name || 'Executor chưa đặt tên')}</b><small>${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || 'Chưa phân loại')}</small></span></button>`;
      }).join('') : '<span class="fingerprint-wing-empty">Đánh dấu ♡ trong danh mục</span>';
    }
    if (musicRoot) {
      musicRoot.innerHTML = favoriteMusicTracks.length ? favoriteMusicTracks.map(track => `<div class="fingerprint-wing-favorite fingerprint-wing-music-favorite"><button class="fingerprint-wing-music-play" type="button" data-wing-music-play="${escapeHtml(track.id)}" title="Phát ${escapeHtml(track.title)}"><span class="fingerprint-wing-icon fingerprint-wing-music-icon">♫</span><span class="fingerprint-wing-copy"><b>${escapeHtml(track.title || 'Bài hát')}</b><small>${escapeHtml(track.artist || 'Chưa rõ nghệ sĩ')}</small></span></button><button class="fingerprint-wing-music-remove" type="button" data-music-favorite="${escapeHtml(track.id)}" aria-label="Bỏ ${escapeHtml(track.title)} khỏi nhạc yêu thích" title="Bỏ yêu thích">♥</button></div>`).join('') : '<span class="fingerprint-wing-empty">Đánh dấu ♡ trong thư viện nhạc</span>';
    }
  }
  function renderFavoriteUniverse() {
    const root = $('#favoriteUniverse');
    const system = $('#favoriteUniverseSystem');
    const nodeLayer = $('#favoriteUniverseNodes');
    if (!root || !system || !nodeLayer) return;
    const favorites = state.items
      .filter(item => getFavoriteIds().has(itemFavoriteKey(item)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'))
      .slice(0, MAX_FAVORITES);
    // All favorites use the same primary orbit and angular velocity. Distribute their
    // phases around the full 360° so eight items remain evenly spaced instead of clumping
    // on three different rings with different speeds.
    const orbit = 0;
    nodeLayer.innerHTML = favorites.map((item, index) => {
      const iconUrl = safeUrl(item.thumbImageUrl);
      const iconText = item.icon || PLATFORM_SYMBOLS[item.platform] || '◈';
      const icon = iconUrl
        ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback data-fallback-mode="placeholder" data-fallback-text="${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}" data-fallback-class="executor-name-brand-fallback">`
        : `<span class="universe-node-text">${escapeHtml(iconText)}</span>`;
      const key = itemFavoriteKey(item);
      const name = item.name || 'Executor chưa đặt tên';
      const platform = PLATFORM_LABELS[item.platform] || item.platform || 'Chưa phân loại';
      const phase = (index / Math.max(1, favorites.length)) * Math.PI * 2 - Math.PI / 2;
      return `<button class="universe-executor" type="button" data-universe-item="${escapeHtml(key)}" data-universe-orbit="${orbit}" data-universe-phase="${phase}" aria-label="Xem thông tin ${escapeHtml(name)}" title="${escapeHtml(name)} · ${escapeHtml(platform)}">${icon}</button>`;
    }).join('');
    const empty = $('#favoriteUniverseEmpty');
    if (empty) empty.hidden = favorites.length > 0;
    const countLabel = $('#favoriteUniverseCount');
    if (countLabel) countLabel.textContent = `${favorites.length} executor · ${favoriteMusicTracks.length} bài nhạc yêu thích`;
    const musicLayer = $('#favoriteUniverseMusicNodes');
    const musicCount = $('#favoriteUniverseMusicCount');
    const musicItems = favoriteMusicTracks;
    if (musicCount) musicCount.textContent = `${musicItems.length} ${musicItems.length === 1 ? 'bài' : 'bài'}`;
    if (musicLayer) musicLayer.innerHTML = musicItems.length ? musicItems.map(track => {
      const id = String(track.id || '');
      const playing = favoriteUniversePlayback.isPlaying && favoriteUniversePlayback.trackId === id;
      const symbol = playing ? '<i></i><i></i><i></i>' : '▶';
      return `<div class="universe-music-track${playing ? ' is-playing' : ''}" data-track-id="${escapeHtml(id)}"><button class="universe-music-play" type="button" data-wing-music-play="${escapeHtml(id)}" aria-pressed="${playing}" aria-label="${playing ? 'Tạm dừng' : 'Phát'} ${escapeHtml(track.title || 'Bài hát')}" title="${playing ? 'Tạm dừng' : 'Phát'} ${escapeHtml(track.title || 'Bài hát')}"><span class="universe-music-note" aria-hidden="true"><span class="universe-music-note-glyph">♫</span><span class="universe-music-equalizer"><i></i><i></i><i></i><i></i></span></span><span class="universe-music-copy"><b>${escapeHtml(track.title || 'Bài hát chưa đặt tên')}</b><small>${escapeHtml(track.artist || 'Chưa rõ nghệ sĩ')}</small></span><span class="universe-music-play-symbol" aria-hidden="true">${symbol}</span></button><button class="universe-music-unfavorite" type="button" data-music-favorite="${escapeHtml(id)}" aria-label="Bỏ ${escapeHtml(track.title || 'bài hát')} khỏi yêu thích" title="Bỏ yêu thích">♥</button></div>`;
    }).join('') : '<span class="universe-music-empty">Đánh dấu ♡ ở thư viện Dynamic để đưa bài hát vào thiên hà. Nhạc nằm ở khu riêng, không dùng chung quỹ đạo executor.</span>';
    renderFingerprintWingLists(favorites);
    root.dataset.favoriteCount = String(favorites.length);
    root.dataset.musicFavoriteCount = String(musicItems.length);
  }

  function syncFavoriteUniversePlayback(detail = {}) {
    const nextTrackId = String(detail.trackId || '');
    const nextIsPlaying = Boolean(detail.isPlaying && nextTrackId);
    const changed = favoriteUniversePlayback.trackId !== nextTrackId || favoriteUniversePlayback.isPlaying !== nextIsPlaying;
    favoriteUniversePlayback = { trackId: nextTrackId, isPlaying: nextIsPlaying };

    $$('.universe-music-track').forEach(card => {
      const id = String(card.dataset.trackId || '');
      const button = card.querySelector('.universe-music-play');
      const symbol = card.querySelector('.universe-music-play-symbol');
      const shouldPlay = nextIsPlaying && id === nextTrackId;
      const wasPlaying = card.classList.contains('is-playing');

      if (shouldPlay) {
        card.classList.remove('is-stopping');
        card.classList.add('is-playing');
        if (!wasPlaying && changed) {
          card.classList.remove('is-starting');
          void card.offsetWidth;
          card.classList.add('is-starting');
          window.setTimeout(() => card.classList.remove('is-starting'), 760);
        }
        if (button) {
          button.setAttribute('aria-pressed', 'true');
          button.setAttribute('aria-label', `Tạm dừng ${card.querySelector('.universe-music-copy b')?.textContent || 'bài hát'}`);
          button.title = 'Tạm dừng bài hát';
        }
        if (symbol) symbol.innerHTML = '<i></i><i></i><i></i>';
      } else {
        if (wasPlaying) {
          card.classList.remove('is-playing', 'is-starting');
          card.classList.add('is-stopping');
          window.setTimeout(() => {
            if (!card.classList.contains('is-playing')) card.classList.remove('is-stopping');
          }, 500);
        }
        if (button) {
          button.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-label', `Phát ${card.querySelector('.universe-music-copy b')?.textContent || 'bài hát'}`);
          button.title = 'Phát bài hát';
        }
        if (symbol) symbol.textContent = '▶';
      }
    });
  }

  function stopUniverseOrbit() {
    if (universeAnimationFrame) window.cancelAnimationFrame(universeAnimationFrame);
    universeAnimationFrame = 0;
  }
  function animateUniverseOrbit(now) {
    universeAnimationFrame = 0;
    if (!universeVisible) return;
    const frameInterval = (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 760) ? 1000 / 24 : 1000 / 30;
    if (now - universeLastFrame < frameInterval) { universeAnimationFrame = window.requestAnimationFrame(animateUniverseOrbit); return; }
    universeLastFrame = now;
    const system = $('#favoriteUniverseSystem');
    if (!system) return;
    const width = system.clientWidth;
    const height = system.clientHeight;
    if (!width || !height) {
      universeAnimationFrame = window.requestAnimationFrame(animateUniverseOrbit);
      return;
    }
    const centerX = width / 2;
    const centerY = height / 2;
    $$('.universe-executor', system).forEach(node => {
      const orbitIndex = Math.max(0, Math.min(UNIVERSE_ORBITS.length - 1, Number(node.dataset.universeOrbit) || 0));
      const orbit = UNIVERSE_ORBITS[orbitIndex];
      const phase = Number(node.dataset.universePhase) || 0;
      const angle = phase + (reducedOrbitMotion ? 0 : now / 1000 * orbit.speed);
      const localX = Math.cos(angle) * width * orbit.rx;
      const localY = Math.sin(angle) * height * orbit.ry;
      const rotation = orbit.rotation * Math.PI / 180;
      const x = centerX + localX * Math.cos(rotation) - localY * Math.sin(rotation);
      const y = centerY + localX * Math.sin(rotation) + localY * Math.cos(rotation);
      const depth = (Math.sin(angle) + 1) / 2;
      const offsetX = x - centerX;
      const offsetY = y - centerY;
      node.style.transform = `translate3d(${offsetX.toFixed(1)}px,${offsetY.toFixed(1)}px,0) translate(-50%,-50%) scale(${(.79 + depth * .2).toFixed(3)})`;
      node.style.setProperty('--universe-scale', (.79 + depth * .2).toFixed(3));
      node.style.setProperty('--universe-opacity', (.78 + depth * .22).toFixed(3));
      node.style.zIndex = depth > .55 ? '8' : '3';
    });
    if (!reducedOrbitMotion) universeAnimationFrame = window.requestAnimationFrame(animateUniverseOrbit);
  }
  function setUniverseVisible(visible) {
    const root = $('#favoriteUniverse');
    if (!root) return;
    universeVisible = Boolean(visible);
    renderFavoriteUniverse();
    root.classList.toggle('is-visible', universeVisible);
    root.setAttribute('aria-hidden', String(!universeVisible));
    root.inert = !universeVisible;
    if (universeVisible) {
      stopUniverseOrbit();
      universeLastFrame = 0;
      universeAnimationFrame = window.requestAnimationFrame(animateUniverseOrbit);
    } else { universeLastFrame = 0; stopUniverseOrbit(); }
  }

  function enableHorizontalFavoriteWheel() {
    const rails = ['#favoriteUniverseMusicNodes', '#fingerprintFavoriteMusic', '#fingerprintFavoriteExecutors']
      .map(selector => $(selector)).filter(Boolean);
    rails.forEach(rail => {
      if (rail.dataset.horizontalWheelBound === '1') return;
      rail.dataset.horizontalWheelBound = '1';
      rail.addEventListener('wheel', event => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
        if (maxScroll <= 1) return;
        const next = Math.max(0, Math.min(maxScroll, rail.scrollLeft + event.deltaY));
        if (Math.abs(next - rail.scrollLeft) < 0.5) return;
        rail.scrollLeft = next;
        event.preventDefault();
      }, { passive:false });
    });
  }
  function initFingerprintControl() {
    const stage = $('#fingerprintStage'), orb = $('#fingerprintOrb'), wings = $('#fingerprintSides');
    if (!stage || !orb || !wings) return;
    let transitionTimer = null;
    let isScanning = false;
    const SCAN_DURATION = 720;
    const WING_OPEN_DURATION = 760;
    const WING_CLOSE_DURATION = 650;
    const isTransitioning = () => stage.classList.contains('is-transitioning') || isScanning;
    const transitionWings = (open) => {
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      stage.classList.remove('is-opening', 'is-closing');
      stage.classList.add('is-transitioning');
      if (open) {
        stage.classList.remove('is-open');
        stage.classList.add('is-opening');
        wings.setAttribute('aria-hidden', 'true');
        wings.inert = true;
        orb.setAttribute('aria-expanded', 'false');
        transitionTimer = window.setTimeout(() => {
          transitionTimer = null;
          stage.classList.remove('is-opening', 'is-transitioning');
          stage.classList.add('is-open');
          wings.setAttribute('aria-hidden', 'false');
          wings.inert = false;
          orb.setAttribute('aria-expanded', 'true');
          setUniverseVisible(true);
        }, WING_OPEN_DURATION);
      } else {
        setUniverseVisible(false);
        stage.classList.add('is-closing');
        wings.setAttribute('aria-hidden', 'true');
        wings.inert = true;
        orb.setAttribute('aria-expanded', 'false');
        transitionTimer = window.setTimeout(() => {
          transitionTimer = null;
          stage.classList.remove('is-open', 'is-closing', 'is-transitioning');
        }, WING_CLOSE_DURATION);
      }
    };
    const toggle = () => {
      if (isTransitioning()) return;
      isScanning = true;
      stage.classList.add('is-scanning');
      // The user only taps/clicks once. A single 360° ring sweep replaces the old 2-second hold.
      window.setTimeout(() => {
        stage.classList.remove('is-scanning');
        isScanning = false;
        transitionWings(!stage.classList.contains('is-open'));
      }, SCAN_DURATION);
    };
    wings.inert = true;
    enableHorizontalFavoriteWheel();
    orb.setAttribute('aria-label', 'Chạm để mở hoặc đóng thiên hà yêu thích');
    orb.addEventListener('click', toggle);
  }
  const dataFingerprint = { catalog: '', versions: '', music: '' };
  let initialDataLoaded = false;
  let refreshInFlight = false;
  let refreshTimer = null;
  let localCatalogChannel = null;
  try { if (localHost && 'BroadcastChannel' in window) { localCatalogChannel = new BroadcastChannel('status-intelligence-catalog'); localCatalogChannel.addEventListener('message', event => { if (event.data?.type === 'catalog-updated' && document.visibilityState === 'visible') refreshPublicData().catch(() => {}); }); } } catch {}
  const fingerprint = value => {
    try { return JSON.stringify(value ?? null); } catch { return String(Date.now()); }
  };
  async function refreshPublicData({ initial = false } = {}) {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const [catalogResult, versionsResult, musicResult] = await Promise.allSettled([
        getJson('/api/catalog', 'data/catalog.json'),
        getJson('/api/roblox-versions', 'data/roblox-versions.json'),
        getJson('/api/music/tracks', 'data/music-tracks.json')
      ]);
      if (catalogResult.status === 'fulfilled') {
        const data = catalogResult.value || {};
        const nextFingerprint = fingerprint(data);
        const catalogChangedOnPublicSite = !initial && isGithubPages && dataFingerprint.catalog && nextFingerprint !== dataFingerprint.catalog;
        if (catalogChangedOnPublicSite) {
          // Force a complete document navigation with a one-use cache-busting query.
          // GitHub Pages/CDN caches may otherwise keep a stale HTML shell even when
          // the JSON snapshot has already changed. The query is removed on init.
          const resetUrl = new URL(window.location.href);
          resetUrl.searchParams.set('__nr_catalog_reset', String(Date.now()));
          resetUrl.hash = 'home';
          window.location.replace(resetUrl.href);
          return;
        }
        if (initial || nextFingerprint !== dataFingerprint.catalog) {
          dataFingerprint.catalog = nextFingerprint;
          state.catalog = data;
          state.items = (Array.isArray(data.items) ? data.items : Array.isArray(data.data?.items) ? data.data.items : []).filter(item => PUBLIC_PLATFORMS.includes(item.platform));
          renderCatalog(); renderStats(data);
          if (localHost) $('#connectionText').textContent = 'Đã kết nối bảng điều khiển localhost';
          else $('#connectionText').textContent = 'Dữ liệu công khai · tự cập nhật';
        }
      } else if (initial) {
        $('#executorGrid').innerHTML = `<div class="empty-state"><strong>Không thể tải danh mục.</strong><p>${escapeHtml(catalogResult.reason?.message || 'Kiểm tra kết nối rồi thử lại.')}</p></div>`;
        $('#catalogResultLabel').textContent = 'Danh mục không khả dụng'; $('#connectionText').textContent = 'Bản dữ liệu không khả dụng';
      }
      if (versionsResult.status === 'fulfilled') {
        const nextFingerprint = fingerprint(versionsResult.value);
        if (initial || nextFingerprint !== dataFingerprint.versions) {
          dataFingerprint.versions = nextFingerprint;
          state.versions = versionsResult.value;
          renderVersionData(versionsResult.value);
        }
      } else if (initial) { renderVersionData({}); $('#versionSourceBadge').textContent = 'Không khả dụng'; }
      if (musicResult.status === 'fulfilled') {
        const musicData = musicResult.value || {};
        const nextFingerprint = fingerprint(musicData);
        if (initial || nextFingerprint !== dataFingerprint.music) {
          dataFingerprint.music = nextFingerprint;
          renderMusic(musicData.tracks || []);
          // Let the central player update its own list without reloading the whole page.
          window.dispatchEvent(new CustomEvent('fishcat:music-library-updated'));
        }
      } else if (initial) {
        $('#musicSectionTrackList').innerHTML = '<div class="loading-text">Bản chụp này chưa có dữ liệu nhạc.</div>';
        $('#musicCount').textContent = 'Thư viện không khả dụng';
      }
      initialDataLoaded = true;
    } finally {
      refreshInFlight = false;
    }
  }
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    // GitHub Pages publishes JSON snapshots as commits. Polling them in-place makes
    // new commits visible without asking the visitor to refresh the entire website.
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshPublicData().catch(error => console.warn('Không thể tự làm mới bản dữ liệu:', error));
    }, localHost ? 10000 : 20000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && initialDataLoaded) refreshPublicData().catch(error => console.warn('Không thể làm mới dữ liệu khi quay lại trang:', error));
    });
    window.addEventListener('focus', () => {
      if (document.visibilityState === 'visible' && initialDataLoaded) refreshPublicData().catch(error => console.warn('Không thể làm mới dữ liệu khi cửa sổ được kích hoạt:', error));
    });
  }
  async function init() {
    // Remove the one-use full-reload cache buster from the address bar after the
    // browser has already requested the refreshed document.
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('__nr_catalog_reset')) {
      currentUrl.searchParams.delete('__nr_catalog_reset');
      currentUrl.hash = 'home';
      window.history.replaceState(null, '', currentUrl.href);
    }
    $('#copyrightYear').textContent = String(new Date().getFullYear());
    $('#captureCurrentTime')?.addEventListener('click', () => {
      manuallyCapturedSnapshotTime = new Date();
      renderStats(state.catalog || {});
      const value = formatExactVietnamDateTime(manuallyCapturedSnapshotTime);
      const button = $('#captureCurrentTime');
      if (button) {
        button.title = `Đã ghi nhận: ${value}`;
        button.setAttribute('aria-label', `Thời điểm bạn nhấn: ${value}`);
      }
    });
    if (localHost) { $('#adminLink').hidden = false; $('#closingAdminLink').hidden = false; $('#closingBrowseLink').hidden = true; }
    $('#connectionText').textContent = localHost ? 'Đã kết nối bảng điều khiển localhost' : 'Dữ liệu công khai · tự cập nhật';
    enableNavigation(); revealOnScroll(); initFingerprintControl();
    $('#executorGrid').addEventListener('click', (event) => { const button = event.target.closest('[data-favorite]'); if (button) { event.preventDefault(); event.stopPropagation(); toggleFavorite(button.dataset.favorite); } });
    $('#favoriteUniverseNodes')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-universe-item]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      openDetails(button.dataset.universeItem);
    });
    await refreshPublicData({ initial: true });
    startAutoRefresh();
  }
  init().catch((error) => { console.error('Không thể khởi tạo website EXECUTOR:', error); showToast('Một số nội dung chưa thể tải.'); });
})();
