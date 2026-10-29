(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname) || location.hostname === '[::1]';
  const isGithubPages = location.hostname.endsWith('github.io');
  const apiUrl = (path) => new URL(path.replace(/^\//, ''), document.baseURI).toString();
  const state = { items: [], tracks: [], versions: null, downloads: {}, activePlatform: 'ALL', query: '', catalog: null, currentTrackId: '' };
  let favoriteMusicTracks = [];
  let favoriteUniversePlayback = { trackId: '', isPlaying: false };
  window.addEventListener('executor:music-favorites-updated', event => { favoriteMusicTracks = Array.isArray(event.detail?.tracks) ? event.detail.tracks : []; renderFavoriteUniverse(); });
  window.addEventListener('executor:music-playback-state', event => syncFavoriteUniversePlayback(event.detail || {}));
  let toastTimer;
  const PUBLIC_PLATFORMS = ['PC', 'macOS', 'Android', 'iOS'];
  const PLATFORM_SYMBOLS = { PC: 'PC', Android: 'A', iOS: 'i', macOS: 'M' };
  const PLATFORM_LABELS = { PC: 'PC', Android: 'Android', iOS: 'iOS', macOS: 'macOS' };
  const MUSIC_GENRE_LABELS = { Pop: 'Nhạc Pop', Rock: 'Nhạc rock', 'Dance / EDM': 'Nhạc điện tử (EDM)', Remix: 'Phối lại (Remix)', 'Lo-fi': 'Nhạc Lo-fi', 'Hip-hop': 'Nhạc Hip-hop', 'R&B': 'Nhạc R&B', Jazz: 'Nhạc Jazz', Classical: 'Nhạc cổ điển', Soundtrack: 'Nhạc phim', Other: 'Khác', 'Pop Rock': 'Nhạc Pop rock', 'Synth-pop': 'Nhạc Synth-pop' };
  const STATUS_LABELS = { online: 'Đang hoạt động', offline: 'Ngoại tuyến', maintenance: 'Bảo trì', unknown: 'Chưa xác minh' };
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
  function formatDate(value) {
    if (!value) return 'Chưa có thời gian cập nhật';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
  }
  function humanizeStatus(status) { return STATUS_LABELS[String(status || 'unknown').toLowerCase()] || 'Chưa xác định'; }
  function statusClass(status) {
    const s = String(status || 'unknown').toLowerCase();
    return ['online', 'offline', 'maintenance'].includes(s) ? `status-${s}` : 'status-unknown';
  }
  function getFilteredItems() {
    const q = state.query.trim().toLowerCase();
    return state.items.filter((item) => {
      if (!PUBLIC_PLATFORMS.includes(item.platform)) return false;
      if (state.activePlatform !== 'ALL' && item.platform !== state.activePlatform) return false;
      if (!q) return true;
      return [item.name, item.platform, item.pcCategory, item.status, item.version, item.compatibilityVersion, item.summary].some((x) => String(x || '').toLowerCase().includes(q));
    });
  }
  function getCounts(items = state.items) {
    const visibleItems = items.filter(item => PUBLIC_PLATFORMS.includes(item.platform));
    const result = { ALL: visibleItems.length, PC: 0, Android: 0, iOS: 0, macOS: 0 };
    for (const item of visibleItems) if (Object.hasOwn(result, item.platform)) result[item.platform]++;
    return result;
  }
  function cardMarkup(item, index) {
    const iconUrl = safeUrl(item.thumbImageUrl);
    const pcCategoryLabels = { paid: 'Trả phí', free: 'Miễn phí', internal: 'External', external: 'External' };
    const category = item.platform === 'PC' && item.pcCategory ? `PC / ${pcCategoryLabels[item.pcCategory] || item.pcCategory}` : (PLATFORM_LABELS[item.platform] || item.platform || 'Chưa phân loại');
    const icon = iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈');
    const summary = item.summary || 'Mục này chưa có mô tả.';
    const favoriteId = itemFavoriteKey(item); const isFavorite = getFavoriteIds().has(favoriteId);
    return `<article class="executor-card ${isFavorite ? 'is-favorite' : ''}" style="animation-delay:${Math.min(index, 10) * 35}ms"><div class="executor-card-body"><button class="executor-favorite" type="button" data-favorite="${escapeHtml(favoriteId)}" aria-label="${isFavorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}" aria-pressed="${isFavorite}" title="${isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button><div class="executor-card-top"><span class="executor-icon">${icon}</span><div class="executor-title-wrap"><h3>${escapeHtml(item.name || 'Mục chưa đặt tên')}</h3><div class="executor-subtitle">${escapeHtml(category)}</div></div><span class="status-label ${statusClass(item.status)}">${escapeHtml(humanizeStatus(item.status))}</span></div><div class="executor-description discord-description-rendered">${window.DiscordDescription ? window.DiscordDescription.render(summary) : escapeHtml(summary)}</div><div class="executor-meta"><span>PHIÊN BẢN · ${escapeHtml(item.version || 'Chưa có thông tin')}</span><button type="button" data-detail="${escapeHtml(item.id || '')}">Xem chi tiết <span>↗</span></button></div></div></article>`;
  }
  function renderCatalog() {
    const favorites = getFavoriteIds();
    const filtered = getFilteredItems().sort((a, b) => Number(favorites.has(itemFavoriteKey(b))) - Number(favorites.has(itemFavoriteKey(a))));
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
    $('#lastUpdated').textContent = catalog?.updatedAt ? formatDate(catalog.updatedAt) : 'Đang chờ bản dữ liệu đầu tiên';
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
        return `<div class="version-mini"><small>${escapeHtml(versionLabel)}</small><strong>${escapeHtml(row.version || 'Chưa cung cấp')}</strong><span>${row.updatedAt ? `Cập nhật ${escapeHtml(formatDate(row.updatedAt))}` : 'Chưa có ngày'}</span></div>`;
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
      const deviceIcon = {
        PC: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
        macOS: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="m8 21 4-4 4 4M5 21h14"/></svg>',
        Android: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 18h2"/></svg>',
        iOS: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>'
      }[key];
      return `<a class="download-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="download-device" data-device="${escapeHtml(key)}">${deviceIcon}</span><span><b>${escapeHtml(key)}</b><small>${escapeHtml(item.label || fallback[key].label)}</small></span><i>↗</i></a>`;
    }).join('');
    $('#downloadLinks').innerHTML = list || '<span class="loading-text">Chưa có liên kết tải an toàn.</span>';
  }
  function extractVideoId(track) {
    if (track?.videoId && /^[\w-]{6,20}$/.test(track.videoId)) return track.videoId;
    try {
      const url = new URL(String(track?.url || ''), document.baseURI);
      if (url.hostname === 'youtu.be') return url.pathname.slice(1);
      if (url.hostname.endsWith('youtube.com')) return url.searchParams.get('v') || '';
    } catch {}
    return '';
  }
  // Admin-uploaded MP3s are restricted to same-origin files under /music/.
  // Resolving against document.baseURI preserves GitHub Pages project paths such as /Executor/.
  function isDirectAudioTrack(track) {
    if (!track || track.sourceType !== 'audio' || track.videoId) return false;
    try {
      const url = new URL(String(track.url || ''), document.baseURI);
      return url.origin === location.origin && /\/music\/[A-Za-z0-9][A-Za-z0-9._-]*\.mp3$/i.test(url.pathname);
    } catch { return false; }
  }
  function isPlayableTrack(track) {
    if (!track) return false;
    if (extractVideoId(track) || isDirectAudioTrack(track)) return true;
    const sourceType = String(track.sourceType || '').toLowerCase();
    try {
      const host = new URL(String(track.url || ''), document.baseURI).hostname.toLowerCase().replace(/^www\./, '');
      return sourceType === 'soundcloud' || ['soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(host)
        || sourceType === 'tiktok' || /(?:^|\.)tiktok\.com$/.test(host);
    } catch { return sourceType === 'soundcloud' || sourceType === 'tiktok'; }
  }
  function renderMusic(tracks) {
    state.tracks = Array.isArray(tracks) ? tracks : [];
    $('#musicCount').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'bài hát' : 'bài hát'} trong thư viện`;
    $('#musicEmpty').hidden = state.tracks.length > 0;
    if (!state.tracks.length) { $('#musicSectionTrackList').innerHTML = '<div class="loading-text">Thư viện nhạc trống. Hãy thêm bài hát trong Admin localhost để hiển thị tại đây.</div>'; return; }
    $('#musicSectionTrackList').innerHTML = state.tracks.slice(0, 10).map((track, i) => {
      const playable = isPlayableTrack(track);
      const playing = state.currentTrackId === String(track.id);
      const audioTag = isDirectAudioTrack(track) ? ' <em class="music-source-tag">MP3</em>' : '';
      return `<div class="music-track${playing ? ' is-playing' : ''}"><div class="track-main"><span class="track-number">${String(i + 1).padStart(2, '0')}</span><span class="track-art">♫</span><span class="track-info"><b>${escapeHtml(track.title || 'Bài hát chưa có tên')}${audioTag}</b><small>${escapeHtml(track.artist || 'Nghệ sĩ chưa rõ')}</small></span></div><span class="track-genre">${escapeHtml(MUSIC_GENRE_LABELS[track.genre] || track.genre || 'Chưa phân loại')}</span><button class="track-play${playing ? ' is-active' : ''}" type="button" data-play-track="${escapeHtml(track.id || '')}" ${playable ? '' : 'disabled'} aria-label="Phát ${escapeHtml(track.title || 'bài hát')}">${playing ? 'Đang phát' : 'Phát'} <span>▶</span></button></div>`;
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
    const mainImage = safeUrl(item.websiteMainImageUrl);
    const website = safeUrl(item.websiteUrl);
    const community = safeUrl(item.communityUrl);
    const source = safeUrl(item.sourceUrl);
    const iconUrl = safeUrl(item.thumbImageUrl);
    const icon = iconUrl ? `<span class="executor-icon"><img src="${escapeHtml(iconUrl)}" alt="" referrerpolicy="no-referrer"></span>` : `<span class="executor-icon">${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}</span>`;
    const image = mainImage ? `<img class="detail-cover" src="${escapeHtml(mainImage)}" alt="${escapeHtml(item.name || 'Executor')} ảnh xem trước" loading="lazy" referrerpolicy="no-referrer">` : '';
    const actions = [[website, 'Mở website ↗', ''], [community, 'Cộng đồng / hỗ trợ ↗', 'secondary'], [source, 'Nguồn ↗', 'secondary']].filter(([url]) => url).map(([url, label, klass]) => `<a class="${klass}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('');
    $('#detailContent').innerHTML = `<div class="detail-content">${image}<div class="detail-title-row">${icon}<div><span class="section-tag">${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || 'NỀN TẢNG')}</span><h2 id="detailTitle">${escapeHtml(item.name || 'Mục chưa đặt tên')}</h2><p>${escapeHtml(item.pcCategory ? `${({paid:'Trả phí',free:'Miễn phí',internal:'External',external:'External'})[item.pcCategory] || item.pcCategory} · ` : '')}${escapeHtml(humanizeStatus(item.status))}</p></div></div><div class="detail-description discord-description-rendered">${window.DiscordDescription ? window.DiscordDescription.render(item.summary || 'Mục này chưa có mô tả.') : escapeHtml(item.summary || 'Mục này chưa có mô tả.')}</div><div class="detail-kv"><div><small>PHIÊN BẢN</small><strong>${escapeHtml(item.version || 'Chưa có thông tin')}</strong></div><div><small>TƯƠNG THÍCH</small><strong>${escapeHtml(item.compatibilityVersion || 'Chưa xác định')}</strong></div><div><small>CẬP NHẬT LẦN CUỐI</small><strong>${escapeHtml(item.updatedAt ? formatDate(item.updatedAt) : 'Chưa cung cấp')}</strong></div><div><small>NỀN TẢNG</small><strong>${escapeHtml(PLATFORM_LABELS[item.platform] || item.platform || 'Chưa xác định')}</strong></div></div><div class="detail-actions">${actions || '<span class="loading-text">Mục này chưa có liên kết bên ngoài.</span>'}</div></div>`;
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
    $('#heroSearchForm')?.addEventListener('submit', (event) => {
      event.preventDefault(); const input = $('#heroSearch'); state.query = input.value.trim(); $('#catalogSearch').value = state.query;
      state.activePlatform = 'ALL'; renderCatalog(); $('#catalog').scrollIntoView({ behavior: 'smooth' });
    });
    $('#heroSearch')?.addEventListener('input', () => { $('#catalogSearch').value = $('#heroSearch').value; state.query = $('#heroSearch').value; renderCatalog(); });
    $('#catalogSearch')?.addEventListener('input', () => { state.query = $('#catalogSearch').value; $('#heroSearch').value = state.query; renderCatalog(); });
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
    // Scroll-aware navigation for every named link that targets one of the page sections.
    // Prefer the actual href target; data-main-nav remains a fallback for custom-named links.
    const sectionKeys = ['top', 'catalog', 'versions', 'music'];
    const navLinks = [...new Set($$('.main-nav-dynamic [data-main-nav], .main-nav-dynamic a[href*="#"], [data-section-nav]'))];
    const sectionKeyForLink = link => {
      const explicit = String(link.dataset.sectionNav || link.dataset.mainNav || '').replace(/^#/, '');
      const href = link.getAttribute('href') || '';
      const hash = href.includes('#') ? href.slice(href.lastIndexOf('#') + 1) : '';
      if (sectionKeys.includes(hash) && document.getElementById(hash)) return hash;
      if (sectionKeys.includes(explicit) && document.getElementById(explicit)) return explicit;
      if (hash && document.getElementById(hash)) return hash;
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
    const updateActiveNavFromScroll = () => {
      navScrollQueued = false;
      // The header is not sticky on the public home page, so use a viewport reading line
      // instead of adding the header height to it (which used to keep the Overview tab stuck).
      const readingLine = Math.max(115, Math.min(260, window.innerHeight * 0.30));
      let activeKey = 'top';
      for (const key of sectionKeys) {
        const section = document.getElementById(key);
        if (section && section.getBoundingClientRect().top <= readingLine) activeKey = key;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
        activeKey = sectionKeys[sectionKeys.length - 1];
      }
      setActiveSection(activeKey);
    };
    const queueActiveNavUpdate = () => {
      if (navScrollQueued) return;
      navScrollQueued = true;
      window.requestAnimationFrame(updateActiveNavFromScroll);
    };
    navLinks.forEach(link => link.addEventListener('click', () => {
      const key = sectionKeyForLink(link);
      if (sectionKeys.includes(key)) setActiveSection(key);
      queueActiveNavUpdate();
    }));
    window.addEventListener('scroll', queueActiveNavUpdate, { passive: true });
    window.addEventListener('resize', queueActiveNavUpdate, { passive: true });
    window.addEventListener('hashchange', () => {
      const key = location.hash.replace(/^#/, '');
      if (sectionKeys.includes(key)) setActiveSection(key);
      queueActiveNavUpdate();
    });
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
  const MAX_FAVORITES = 6;
  function getFavoriteIds() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      const raw = Array.isArray(stored) ? stored.map(String) : [];
      const normalized = [...new Set(raw.filter(Boolean))].slice(0, MAX_FAVORITES);
      // Repair older browser storage that may already contain more than six favorites.
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
        showToast('Bạn đã đạt giới hạn 6 executor yêu thích. Hãy bỏ yêu thích một mục trước.');
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
  const reducedOrbitMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;

  function renderFingerprintWingLists(executorFavorites) {
    const executorRoot = $('#fingerprintFavoriteExecutors');
    const musicRoot = $('#fingerprintFavoriteMusic');
    if (executorRoot) {
      executorRoot.innerHTML = executorFavorites.length ? executorFavorites.map(item => {
        const iconUrl = safeUrl(item.thumbImageUrl);
        const icon = iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${escapeHtml(item.icon || PLATFORM_SYMBOLS[item.platform] || '◈')}</span>`;
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
    // phases around the full 360° so six items remain evenly spaced instead of clumping
    // on three different rings with different speeds.
    const orbit = 0;
    nodeLayer.innerHTML = favorites.map((item, index) => {
      const iconUrl = safeUrl(item.thumbImageUrl);
      const iconText = item.icon || PLATFORM_SYMBOLS[item.platform] || '◈';
      const icon = iconUrl
        ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
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
      node.style.left = `${x.toFixed(2)}px`;
      node.style.top = `${y.toFixed(2)}px`;
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
      universeAnimationFrame = window.requestAnimationFrame(animateUniverseOrbit);
    } else stopUniverseOrbit();
  }

  function initFingerprintControl() {
    const stage = $('#fingerprintStage'), orb = $('#fingerprintOrb'), wings = $('#fingerprintSides');
    if (!stage || !orb || !wings) return;
    const gemRing = $('.fingerprint-gem-ring', orb);
    let holdTimer = null;
    let progressFrame = 0;
    let transitionTimer = null;
    let holdStartedAt = 0;
    const HOLD_DURATION = 2000;
    const WING_OPEN_DURATION = 820;
    const WING_CLOSE_DURATION = 720;
    const isTransitioning = () => stage.classList.contains('is-transitioning');
    const setProgress = (degrees) => {
      const safeDegrees = Math.max(0, Math.min(360, Number(degrees) || 0));
      orb.style.setProperty('--fingerprint-progress', `${safeDegrees}deg`);
      // One timeline drives both the circular edge and the scan line crossing the fingerprint.
      orb.style.setProperty('--fingerprint-scan-y', `${17 + (safeDegrees / 360) * 36}px`);
    };
    const setGemSpinSpeed = (rate) => {
      if (!gemRing || typeof gemRing.getAnimations !== 'function') return;
      const animation = gemRing.getAnimations().find((item) => item.animationName === 'fingerprintGems');
      // Changing playbackRate preserves the current animation time, so stones keep rotating from their live phase.
      if (animation && typeof animation.updatePlaybackRate === 'function' && Math.abs(animation.playbackRate - rate) > 0.01) {
        animation.updatePlaybackRate(rate);
      }
    };
    const stopProgressFrame = () => {
      if (progressFrame) window.cancelAnimationFrame(progressFrame);
      progressFrame = 0;
    };
    const paintProgress = (now) => {
      if (!stage.classList.contains('is-holding')) { progressFrame = 0; return; }
      const progress = Math.max(0, Math.min(1, (now - holdStartedAt) / HOLD_DURATION));
      setProgress(progress * 360);
      if (progress < 1) progressFrame = window.requestAnimationFrame(paintProgress);
      else progressFrame = 0;
    };
    const transitionWings = (open) => {
      if (transitionTimer !== null) window.clearTimeout(transitionTimer);
      stage.classList.remove('is-opening', 'is-closing');
      stage.classList.add('is-transitioning');
      stage.classList.remove('is-holding', 'is-system-checking');
      setGemSpinSpeed(1);
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
          // Reveal the multiverse only after Dynamic has collapsed and both wings have finished opening.
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
    const begin = (event) => {
      if (event.type === 'keydown' && (![' ', 'Enter'].includes(event.key) || event.repeat)) return;
      if (isTransitioning() || holdTimer !== null || stage.classList.contains('is-holding')) return;
      if (event.type === 'pointerdown' && typeof orb.setPointerCapture === 'function' && Number.isInteger(event.pointerId)) {
        try { orb.setPointerCapture(event.pointerId); } catch {}
      }
      stage.classList.add('is-holding');
      setGemSpinSpeed(9);
      holdStartedAt = window.performance.now();
      setProgress(0);
      stopProgressFrame();
      progressFrame = window.requestAnimationFrame(paintProgress);
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        stopProgressFrame();
        setProgress(360);
        const open = !stage.classList.contains('is-open');
        if (!open) {
          // Closing stays direct: keep the stable two-second hold and wing animation,
          // without replaying the system-loading Dynamic Island sequence.
          transitionWings(false);
          return;
        }
        // First-open sequence: finish the hold, run the shared Dynamic status check,
        // let its 0–100% progress and success tick close back to the compact pill,
        // and only then reveal the decorative wings.
        stage.classList.remove('is-holding');
        stage.classList.add('is-transitioning', 'is-system-checking');
        setGemSpinSpeed(1);
        setProgress(0);
        const runSystemLoading = window.ExecutorDynamicStatus?.runSystemLoading;
        const fallbackLoading = () => new Promise(resolve => window.setTimeout(resolve, 2000));
        Promise.resolve()
          .then(() => typeof runSystemLoading === 'function' ? runSystemLoading({ duration: 2000 }) : fallbackLoading())
          .catch(() => fallbackLoading())
          .finally(() => {
            stage.classList.remove('is-system-checking');
            setProgress(0);
            transitionWings(true);
          });
      }, HOLD_DURATION);
      if (event.type === 'keydown') event.preventDefault();
    };
    const end = () => {
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      holdTimer = null;
      stopProgressFrame();
      stage.classList.remove('is-holding');
      setGemSpinSpeed(1);
      setProgress(0);
    };
    // Keep the decorative wings inert while their opening/closing animation is running.
    wings.inert = true;
    orb.addEventListener('pointerdown', begin);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => orb.addEventListener(type, end));
    orb.addEventListener('keydown', begin);
    orb.addEventListener('keyup', end);
    orb.addEventListener('blur', end);
  }
  const dataFingerprint = { catalog: '', versions: '', music: '' };
  let initialDataLoaded = false;
  let refreshInFlight = false;
  let refreshTimer = null;
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
    }, 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && initialDataLoaded) refreshPublicData().catch(error => console.warn('Không thể làm mới dữ liệu khi quay lại trang:', error));
    });
  }
  async function init() {
    $('#copyrightYear').textContent = String(new Date().getFullYear());
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
