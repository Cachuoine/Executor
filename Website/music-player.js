(() => {
  const $ = selector => document.querySelector(selector);
  // r5 static html guard is also present in markup to avoid a first-paint selection flash.
  document.documentElement.classList.add('executor-no-dblclick-edit');
  // Double-click outside editable fields must not select page text or trigger an
  // editor-like browser action. Real inputs and textareas remain fully editable.
  document.addEventListener('dblclick', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [data-allow-text-select]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('selectstart', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [data-allow-text-select]')) return;
    event.preventDefault();
  }, true);
  const dock = $('#musicDock');
  if (!dock) return;
  const dynamicNav = dock.closest('.main-nav-dynamic');
  // The public music player is available, but stays silent with no track selected until the visitor chooses a song.
  dock.classList.remove('hidden', 'music-public-pending');
  dock.classList.add('music-public-ready');
  const island = $('#musicIslandToggle');
  const panel = $('#musicPanel');
  const player = $('#musicPlayer');
  let directAudio = document.getElementById('musicDirectAudio');
  if (!directAudio && player) { directAudio = document.createElement('audio'); directAudio.id = 'musicDirectAudio'; directAudio.preload = 'metadata'; directAudio.hidden = true; player.parentElement?.appendChild(directAudio); }
  let directAudioTrackId = '';
  const getDirectAudioUrl = track => {
    if (!track || track.sourceType !== 'audio' || track.videoId) return '';
    try {
      const url = new URL(String(track.url || ''), document.baseURI);
      if (url.origin !== location.origin || !/\/music\/[A-Za-z0-9][A-Za-z0-9._-]*\.mp3$/i.test(url.pathname)) return '';
      return url.href;
    } catch { return ''; }
  };
  const isDirectAudioTrack = track => Boolean(getDirectAudioUrl(track));
  const isSoundCloudTrack = track => Boolean(track && (track.sourceType === 'soundcloud' || (!track.videoId && /soundcloud\.com/i.test(String(track.url || '')))));
  const isTikTokTrack = track => {
    if (!track) return false;
    if (track.sourceType === 'tiktok') return true;
    try { return /(?:^|\.)tiktok\.com$/i.test(new URL(String(track.url || '')).hostname); } catch { return false; }
  };
  const search = $('#musicSearch');
  const list = $('#musicTrackList');
  const playbackStatus = $('#musicPlaybackStatus');
  const playbackToggle = $('#musicPlaybackToggle');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const FALLBACK = [
    { id: 'mra', title: 'Tell Me Why', artist: 'Mr.A · Remake by MGM Studio', genre: 'Remix', videoId: 'EMUKd20IbuM', url: 'https://youtu.be/EMUKd20IbuM', pinned: true }
  ];
  // Curated starters are merged with server-managed tracks so existing installations
  // also receive a useful library without overwriting their saved/admin-added songs.
  const RECOMMENDED_TRACKS = [
    { id: 'rec-alan-walker-faded', title: 'Faded', artist: 'Alan Walker', genre: 'EDM', videoId: '60ItHLz5WEA', url: 'https://youtu.be/60ItHLz5WEA', recommended: true },
    { id: 'rec-adele-hello', title: 'Hello', artist: 'Adele', genre: 'Pop', videoId: 'YQHsXMglC9A', url: 'https://youtu.be/YQHsXMglC9A', recommended: true },
    { id: 'rec-maroon5-sugar', title: 'Sugar', artist: 'Maroon 5', genre: 'Pop', videoId: '09R8_2nJtjg', url: 'https://youtu.be/09R8_2nJtjg', recommended: true },
    { id: 'rec-ed-sheeran-perfect', title: 'Perfect', artist: 'Ed Sheeran', genre: 'Pop', videoId: '2Vv-BfVoq4g', url: 'https://youtu.be/2Vv-BfVoq4g', recommended: true },
    { id: 'rec-one-republic-counting-stars', title: 'Counting Stars', artist: 'OneRepublic', genre: 'Pop Rock', videoId: 'hT_nvWreIhg', url: 'https://youtu.be/hT_nvWreIhg', recommended: true },
    { id: 'rec-ed-sheeran-shape-of-you', title: 'Shape of You', artist: 'Ed Sheeran', genre: 'Pop', videoId: 'JGwWNGJdvx8', url: 'https://youtu.be/JGwWNGJdvx8', recommended: true },
    { id: 'rec-weeknd-blinding-lights', title: 'Blinding Lights', artist: 'The Weeknd', genre: 'Synth-pop', videoId: '4NRXx6U8ABQ', url: 'https://youtu.be/4NRXx6U8ABQ', recommended: true }
  ];
  let tracks = [...FALLBACK, ...RECOMMENDED_TRACKS];
  const MUSIC_STATE_KEY = 'fishcat-music-playback-state-v1';
  // Playback is intentionally ephemeral: never restore the selected track, playback
  // position, open Dynamic state, or autoplay after reload/navigation. Clear values
  // written by older builds so they cannot silently revive stale playback state.
  function clearLegacyMusicState() {
    try {
      localStorage.removeItem(MUSIC_STATE_KEY);
      localStorage.removeItem('fishcat-music-track');
    } catch {}
  }
  clearLegacyMusicState();
  let currentTrack = '';
  let savedPosition = 0;
  let shouldResumePlayback = false;
  let pageIsLeaving = false;
  let playbackStateSaveTimer = null;
  let query = '';
  let hasPlaybackAttempt = false;
  let isPlaying = false;
  let islandTransitionLocked = false;
  let islandTransitionMode = null;
  let islandTransitionTimer = null;
  let panelCloseTimer = null;
  let dockCloseStartTimer = null;
  let lockedTabIndexSnapshot = [];
  let dockCloseSizeSnapshot = null;
  // One clock owns the island shell, the Library morph, its contents, and the interaction lock.
  // Do not derive it from every descendant: decorative/infinite animations used to keep the
  // controls locked long after the visible morph had finished.
  const ISLAND_TRANSITION_SAFETY_MS = 180;
  function getIslandMorphDurationMs() {
    // Keep JavaScript's lock/finalization timers tied to the exact CSS morph duration,
    // including a reduced-motion preference, instead of maintaining a second clock.
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--si-library-morph-duration').trim();
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return 1600;
    if (raw.endsWith('ms')) return value;
    if (raw.endsWith('s')) return value * 1000;
    return 1600;
  }
  function getLibraryRevealDurationMs() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--si-library-reveal-duration').trim();
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return 900;
    if (raw.endsWith('ms')) return value;
    if (raw.endsWith('s')) return value * 1000;
    return 900;
  }
  function getTransitionLockDuration() {
    // The island, tab wings and library begin together; keep inputs locked only
    // until the longest visible transition plus a small browser-frame safety margin.
    return Math.max(getIslandMorphDurationMs(), getLibraryRevealDurationMs()) + ISLAND_TRANSITION_SAFETY_MS;
  }
  function unlockIslandTransition() {
    if (!islandTransitionLocked) return;
    islandTransitionLocked = false;
    islandTransitionMode = null;
    if (islandTransitionTimer) clearTimeout(islandTransitionTimer);
    islandTransitionTimer = null;
    dock.classList.remove('is-transition-locked');
    dynamicNav?.classList.remove('music-nav-transition-locked');
    dock.removeAttribute('aria-busy');
    if (island) {
      island.removeAttribute('aria-disabled');
      island.removeAttribute('aria-busy');
    }
    // Restore each control's original tab order exactly as it was before locking.
    for (const saved of lockedTabIndexSnapshot) {
      if (!saved.element.isConnected) continue;
      if (saved.value === null) saved.element.removeAttribute('tabindex');
      else saved.element.setAttribute('tabindex', saved.value);
    }
    lockedTabIndexSnapshot = [];
    if (panel) panel.removeAttribute('aria-busy');
  }
  function lockIslandTransition(mode) {
    islandTransitionLocked = true;
    islandTransitionMode = mode;
    dock.classList.add('is-transition-locked');
    // The nav morph class remains applied while the Library is open to keep the
    // tabs tucked away; only this short-lived lock class should force a prohibited cursor.
    dynamicNav?.classList.add('music-nav-transition-locked');
    dock.setAttribute('aria-busy', 'true');
    // Keep the dock hit-testable so rapid clicks are caught here rather than
    // falling through to the page underneath, but remove its controls from the
    // tab order and swallow activation/input events until the morph completes.
    lockedTabIndexSnapshot = Array.from(dock.querySelectorAll('a, button, input, select, textarea, [tabindex]'))
      .map(element => ({ element, value: element.getAttribute('tabindex') }));
    for (const saved of lockedTabIndexSnapshot) saved.element.setAttribute('tabindex', '-1');
    if (island) {
      island.setAttribute('aria-disabled', 'true');
      island.setAttribute('aria-busy', 'true');
    }
    if (panel) panel.setAttribute('aria-busy', 'true');
    if (islandTransitionTimer) clearTimeout(islandTransitionTimer);
    islandTransitionTimer = null;
  }
  function scheduleTransitionUnlock() {
    if (!islandTransitionLocked) return;
    if (islandTransitionTimer) clearTimeout(islandTransitionTimer);
    islandTransitionTimer = setTimeout(unlockIslandTransition, getTransitionLockDuration());
  }
  function beginIslandClose() {
    if (islandTransitionLocked || !panel || panel.classList.contains('hidden')) return;
    lockIslandTransition('closing');
    closeMusicCenter();
    // Keep focus out of the now-hidden library while the island is collapsing.
    if (island) island.focus({ preventScroll: true });
    // Keep the full dock locked until the shared panel/island morph completes.
    // The CSS duration is read after the state classes have changed.
    scheduleTransitionUnlock();
  }
  function handleIslandToggle() {
    if (islandTransitionLocked || dock.classList.contains('is-system-checking')) return;
    if (panel?.classList.contains('hidden')) {
      lockIslandTransition('opening');
      openMusicCenter();
      scheduleTransitionUnlock();
    } else {
      beginIslandClose();
    }
  }
  function lang() { return 'vi'; }
  function syncMusicLanguage() {
    const vi = lang() === 'vi';
    const set = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
    const searchInput = $('#musicSearch'); if (searchInput) searchInput.placeholder = vi ? 'Tìm bài hát hoặc nghệ sĩ…' : 'Tìm bài hát hoặc nghệ sĩ…';
    const heading = $('#musicPanel .music-panel-heading strong'); if (heading) heading.textContent = vi ? 'Thư viện nhạc' : 'Thư viện nhạc';
    const searchButton = $('#musicSearchForm button'); if (searchButton) searchButton.textContent = vi ? 'Tìm' : 'Tìm';
    const discover = $('#musicDiscover'); if (discover) discover.textContent = vi ? 'Khám phá nhạc mới ↗' : 'Khám phá nhạc mới ↗';
    const source = $('#musicOpenSource'); if (source) source.textContent = vi ? 'Mở nguồn ↗' : 'Mở nguồn ↗';
    const status = $('#musicPlaybackStatus'); if (status && !isPlaying && !hasPlaybackAttempt) status.textContent = vi ? 'Chọn bài để phát. YouTube có thể hiển thị quảng cáo trước bài hát.' : 'Chọn bài để phát. YouTube có thể hiển thị quảng cáo trước bài hát.';
    const toggle = $('#musicPlaybackToggle'); if (toggle) { toggle.textContent = isPlaying ? (vi ? 'Tạm dừng tại đây ■' : 'Tạm dừng tại đây ■') : (currentTrack ? (vi ? 'Phát bài đã chọn ▶' : 'Phát bài đã chọn ▶') : (vi ? 'Chọn bài trước ▶' : 'Chọn bài trước ▶')); toggle.disabled = !currentTrack; }
  }
  function tr(vi, en) { return vi; }
  function setPlaybackStatus(message) { if (playbackStatus) playbackStatus.textContent = message; }
  function syncPlaybackVisuals() {
    // Wave animation is a playback indicator, not ambient decoration.
    dock.classList.toggle('is-playing', isPlaying);
    const wave = dock.querySelector('.music-wave');
    if (wave) wave.setAttribute('aria-label', isPlaying ? tr('Đang phát nhạc', 'Đang phát nhạc') : tr('Nhạc đang tạm dừng', 'Nhạc đang tạm dừng'));
  }
  function freezeDockSizeForClose() {
    if (dockCloseSizeSnapshot) return;
    const rect = dock.getBoundingClientRect();
    dockCloseSizeSnapshot = ['width', 'height'].map(property => ({
      property,
      value: dock.style.getPropertyValue(property),
      priority: dock.style.getPropertyPriority(property)
    }));
    // Freeze the exact visible size as numeric values before adding .is-closing.
    // This avoids trying to transition from intrinsic/auto sizing directly to 88x36,
    // which can look like the pill suddenly collapses in some browser/layout states.
    dock.style.setProperty('width', `${rect.width}px`);
    dock.style.setProperty('height', `${rect.height}px`);
    void dock.offsetWidth;
  }
  function restoreDockSizeAfterClose() {
    if (!dockCloseSizeSnapshot) return;
    for (const saved of dockCloseSizeSnapshot) {
      if (saved.value) dock.style.setProperty(saved.property, saved.value, saved.priority);
      else dock.style.removeProperty(saved.property);
    }
    dockCloseSizeSnapshot = null;
  }
  function setCollapsed(collapsed) {
    // One continuous glass pill is the only trigger in both states. Its wrapper
    // width animates between the full player and a short pill; no separate dot button.
    dock.classList.toggle('is-collapsed', collapsed);
    island?.classList.remove('hidden');
    if (island) {
      const panelOpen = Boolean(panel && !panel.classList.contains('hidden') && !panel.classList.contains('is-closing'));
      island.setAttribute('aria-hidden', 'false');
      island.tabIndex = islandTransitionLocked ? -1 : 0;
      island.setAttribute('aria-expanded', String(panelOpen));
      island.setAttribute('aria-label', panelOpen ? tr('Đóng thư viện nhạc', 'Đóng thư viện nhạc') : tr('Mở thư viện nhạc', 'Mở thư viện nhạc'));
    }
  }
  // The fingerprint interaction borrows this same Dynamic Island as a short-lived
  // system-status surface. It never expands the Music Library and never starts audio.
  const dynamicStatusView = $('#dynamicStatusView');
  const dynamicStatusLabel = $('#dynamicStatusLabel');
  const dynamicStatusValue = $('#dynamicStatusValue');
  const dynamicStatusFill = $('#dynamicStatusFill');
  const dynamicStatusPercent = $('#dynamicStatusPercent');
  const dynamicStatusState = $('#dynamicStatusState');
  let dynamicStatusPromise = null;
  const waitForMotion = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  function hardCollapseMusicLibraryForSystemCheck() {
    // Cancel any in-flight Library morph and hide the panel immediately. The loading
    // surface shares the island shell, not the Library DOM or its playback controls.
    if (panelCloseTimer) clearTimeout(panelCloseTimer);
    if (dockCloseStartTimer) clearTimeout(dockCloseStartTimer);
    if (islandTransitionTimer) clearTimeout(islandTransitionTimer);
    panelCloseTimer = null;
    dockCloseStartTimer = null;
    islandTransitionTimer = null;
    if (islandTransitionLocked) unlockIslandTransition();
    if (panel) {
      panel.classList.add('hidden');
      panel.classList.remove('is-opening', 'is-closing');
      panel.removeAttribute('aria-busy');
    }
    dock.classList.remove('is-transition-locked', 'is-closing', 'music-centered', 'music-opening', 'is-system-closing', 'is-system-complete');
    dynamicNav?.classList.remove('music-nav-transition-locked', 'music-nav-morphing', 'music-nav-restoring');
    if (island) {
      island.setAttribute('aria-expanded', 'false');
      island.setAttribute('aria-label', tr('Đang khởi tạo hệ thống', 'Đang khởi tạo hệ thống'));
      island.removeAttribute('aria-busy');
      island.removeAttribute('aria-disabled');
    }
    setCollapsed(true);
  }
  async function runSystemLoading({ duration = 2000 } = {}) {
    if (dynamicStatusPromise) return dynamicStatusPromise;
    const loadingDuration = Math.max(100, Math.min(6000, Number(duration) || 2000));
    if (!dock || !island || !dynamicStatusView || !dynamicNav) {
      await waitForMotion(loadingDuration);
      return true;
    }
    dynamicStatusPromise = (async () => {
      hardCollapseMusicLibraryForSystemCheck();
      dynamicNav.style.setProperty('--si-library-morph-duration', '900ms');
      dynamicNav.style.setProperty('--si-library-reveal-duration', '520ms');
      dynamicNav.classList.add('music-system-checking', 'music-nav-morphing');
      dock.classList.remove('is-collapsed');
      dock.classList.add('music-centered', 'is-system-checking');
      dock.classList.remove('is-system-closing', 'is-system-complete');
      dynamicStatusView.setAttribute('aria-hidden', 'false');
      dynamicStatusLabel.textContent = 'EXECUTOR · SYSTEM';
      dynamicStatusValue.textContent = 'Đang khởi tạo';
      dynamicStatusPercent.textContent = '0%';
      dynamicStatusFill.style.transform = 'scaleX(0)';
      dynamicStatusState.classList.remove('is-complete');
      island.setAttribute('aria-expanded', 'false');
      island.setAttribute('aria-label', tr('Đang khởi tạo hệ thống', 'Đang khởi tạo hệ thống'));
      // Let the pill finish its slower opening morph before the 2-second loading clock starts.
      await nextFrame();
      await nextFrame();
      await waitForMotion(920);

      // Two-second continuous progress, without a midpoint pause.
      const animateProgress = (from, to, phaseDuration) => new Promise(resolve => {
        const startedAt = performance.now();
        const paint = now => {
          const phase = Math.max(0, Math.min(1, (now - startedAt) / phaseDuration));
          const progress = from + (to - from) * phase;
          const percent = Math.floor(progress * 100);
          dynamicStatusPercent.textContent = `${percent}%`;
          dynamicStatusValue.textContent = phase >= 1 ? `Đang tải ${Math.round(to * 100)}%` : `Đang tải ${percent}%`;
          dynamicStatusFill.style.transform = `scaleX(${progress})`;
          if (phase < 1) requestAnimationFrame(paint);
          else resolve();
        };
        requestAnimationFrame(paint);
      });
      await animateProgress(0, 1, loadingDuration);
      dynamicStatusPercent.textContent = '100%';
      dynamicStatusValue.textContent = 'Hệ thống sẵn sàng';
      dynamicStatusLabel.textContent = 'KHỞI TẠO HOÀN TẤT';
      dynamicStatusState.classList.add('is-complete');
      dock.classList.add('is-system-complete');
      await waitForMotion(520);

      // Retract the status island first. The wing reveal is started by app.js only
      // after this promise resolves, so the two visual sequences never overlap.
      dock.classList.add('is-system-closing');
      dock.classList.remove('music-centered');
      dynamicNav.classList.remove('music-nav-morphing');
      dynamicNav.classList.add('music-nav-restoring');
      await waitForMotion(960);
      dock.classList.remove('is-system-checking', 'is-system-closing', 'is-system-complete', 'music-centered', 'music-opening', 'is-closing');
      dynamicNav.classList.remove('music-system-checking', 'music-nav-restoring');
      dynamicNav.style.removeProperty('--si-library-morph-duration');
      dynamicNav.style.removeProperty('--si-library-reveal-duration');
      dynamicStatusView.setAttribute('aria-hidden', 'true');
      dynamicStatusState.classList.remove('is-complete');
      dynamicStatusLabel.textContent = 'EXECUTOR · SYSTEM';
      dynamicStatusValue.textContent = 'Đang khởi tạo';
      dynamicStatusPercent.textContent = '0%';
      dynamicStatusFill.style.transform = 'scaleX(0)';
      setCollapsed(true);
      island.setAttribute('aria-expanded', 'false');
      island.setAttribute('aria-label', tr('Mở thư viện nhạc', 'Mở thư viện nhạc'));
      return true;
    })().finally(() => { dynamicStatusPromise = null; });
    return dynamicStatusPromise;
  }
  window.ExecutorDynamicStatus = Object.freeze({ runSystemLoading });
  function openMusicCenter() {
    restoreDockSizeAfterClose();
    if (panelCloseTimer) {
      clearTimeout(panelCloseTimer);
      panelCloseTimer = null;
    }
    if (dockCloseStartTimer) {
      clearTimeout(dockCloseStartTimer);
      dockCloseStartTimer = null;
    }
    dock.classList.remove('is-closing');
    panel?.classList.remove('is-closing');
    // All three surfaces start in the same frame: the island grows, both tab wings
    // glide inward, and the library scales out from its own center at the same time.
    dynamicNav?.classList.remove('music-nav-restoring');
    dynamicNav?.classList.add('music-nav-morphing');
    dock.classList.add('music-centered', 'music-opening');
    setCollapsed(false);
    panel?.classList.add('is-opening');
    panel?.classList.remove('hidden');
    // Paint the library's tiny centered pose once before transitioning to full size.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panel?.classList.remove('is-opening');
      dock.classList.remove('music-opening');
    }));
    setCollapsed(false);
  }
  function finishMusicCenterClose() {
    if (panelCloseTimer) clearTimeout(panelCloseTimer);
    if (dockCloseStartTimer) clearTimeout(dockCloseStartTimer);
    panelCloseTimer = null;
    dockCloseStartTimer = null;
    // Restore original inline sizing while .is-closing still holds the target dimensions;
    // the final collapsed class then keeps the exact same capsule endpoint.
    restoreDockSizeAfterClose();
    // Hide the morph overlay only after it has reached the same 88x36/84x35 capsule
    // geometry as the real island. The final state switch therefore has no second scale.
    panel?.classList.add('hidden');
    panel?.classList.remove('is-closing', 'is-opening');
    dock.classList.remove('is-closing', 'music-centered', 'music-opening');
    dynamicNav?.classList.remove('music-nav-morphing', 'music-nav-restoring');
    setCollapsed(true);
  }
  function closeMusicCenter() {
    if (!panel || panel.classList.contains('hidden') || panel.classList.contains('is-closing')) return;
    if (panelCloseTimer) {
      clearTimeout(panelCloseTimer);
      panelCloseTimer = null;
    }
    // Close in parallel: the library shrinks back to its center, the pill contracts,
    // and both navigation wings return in this same frame (the inverse of opening).
    panel.classList.remove('is-opening');
    panel.classList.add('is-closing');
    dock.classList.add('is-closing');
    dynamicNav?.classList.add('music-nav-restoring');
    dynamicNav?.classList.remove('music-nav-morphing');
    if (island) {
      island.setAttribute('aria-expanded', 'false');
      island.setAttribute('aria-label', tr('Mở thư viện nhạc', 'Mở thư viện nhạc'));
    }

    // The three animations run concurrently, so finalize after the longest one settles.
    // This timer is also a fallback if the browser cancels an animation event.
    panelCloseTimer = setTimeout(finishMusicCenterClose, Math.max(getLibraryRevealDurationMs(), getIslandMorphDurationMs()) + 150);
  }
  function activeTrack() { return currentTrack ? (tracks.find(track => track.id === currentTrack) || null) : null; }
  function render() {
    // Always display tracks alphabetically, independent of pinning or insertion order.
    tracks.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base', numeric: true }));
    // Tìm only actual song/title and artist names. Genres and labels such as Remix
    // are deliberately excluded so the results stay predictable.
    const rows = tracks.filter(track => `${track.title} ${track.artist}`.toLowerCase().includes(query));
    const isBuiltIn = track => Boolean(track.pinned || track.recommended || String(track.id || '').startsWith('rec-') || track.id === 'mra');
    const renderRows = (items, startIndex) => items.map((track, offset) => `<button type="button" class="music-track-choice${track.id === currentTrack ? ' active' : ''}${track.id === currentTrack && isPlaying ? ' is-playing' : ''}" data-music-track="${escapeHtml(track.id)}" aria-label="${escapeHtml(track.id === currentTrack && isPlaying ? `${tr('Tạm dừng','Tạm dừng')} ${track.title}` : `${tr('Phát','Phát')} ${track.title}`)}"><span class="music-track-number">${String(startIndex + offset + 1).padStart(2,'0')}</span><span class="music-track-name"><b>${escapeHtml(track.title)}</b><small>${escapeHtml(track.artist)}</small></span><span class="music-track-play">${track.id === currentTrack && isPlaying ? 'Ⅱ' : '▶'}</span></button>`).join('');
    if (list) {
      if (!rows.length) list.innerHTML = `<div class="music-library-loading">${tr('Không tìm thấy bài hát phù hợp.','Không tìm thấy bài hát phù hợp.')}</div>`;
      else {
        // Public player stays as one clean, unified playlist. Source grouping is admin-only.
        list.innerHTML = renderRows(rows, 0);
      }
    }
    const count = $('#musicLibraryCount'); if (count) count.textContent = tr(`${tracks.length} bài trong thư viện`, `${tracks.length} bài trong thư viện`);
    const discover = $('#musicDiscover'); if (discover) discover.href = `https://music.youtube.com/search?q=${encodeURIComponent(query || 'new music')}`;
    syncMusicLanguage();
    const track = activeTrack();
    const title = $('#musicTrackTitle'), artist = $('#musicTrackArtist'), state = $('#musicNowLabel'), source = $('#musicOpenSource');
    if (title) title.textContent = track ? track.title : tr('Chọn bài hát', 'Chọn bài hát');
    if (artist) artist.textContent = track ? track.artist : tr('Chưa có nhạc đang phát', 'Chưa có nhạc đang phát');
    if (state) state.textContent = isPlaying ? tr('ĐANG PHÁT', 'ĐANG PHÁT') : tr('TRÌNH PHÁT NHẠC', 'TRÌNH PHÁT NHẠC');
    if (source) source.href = track?.url || 'https://music.youtube.com/';
    if (playbackToggle) {
      playbackToggle.textContent = isPlaying ? tr('Tạm dừng tại đây ■', 'Tạm dừng tại đây ■') : (track ? tr('Phát bài đã chọn ▶', 'Phát bài đã chọn ▶') : tr('Chọn bài trước ▶', 'Chọn bài trước ▶'));
      playbackToggle.setAttribute('aria-pressed', String(isPlaying));
      playbackToggle.disabled = !track;
    }
  }
  function persistMusicState() {
    // Backward-compatible event-hook target only. Playback state is memory-only;
    // writes to localStorage are intentionally disabled.
  }
  function requestPlayerPosition() {
    if (!player || player.src === 'about:blank') return;
    try {
      player.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }), 'https://www.youtube-nocookie.com');
      player.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'fishcat-music' }), 'https://www.youtube-nocookie.com');
    } catch {}
  }
  // The iframe is recreated by a full-page navigation. Save its last reported playback
  // position so Home/Admin/reset navigation resumes the same song instead of 00:00.
  window.addEventListener('message', event => {
    if (pageIsLeaving) return;
    let data = event.data;
    try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
    if (!data || typeof data !== 'object') return;
    if (event.origin === 'https://www.tiktok.com' && event.source === player?.contentWindow) {
      const payload = data.value ?? data.info ?? data;
      if (data.type === 'onCurrentTime' && Number.isFinite(Number(payload?.currentTime))) {
        savedPosition = Math.max(0, Number(payload.currentTime));
        if (Date.now() % 2000 < 1000) persistMusicState();
      } else if (data.type === 'onStateChange') {
        const state = Number(payload);
        if (state === 1) { if (!shouldResumePlayback) return; isPlaying = true; persistMusicState(); syncPlaybackVisuals(); }
        else if (state === 2 || state === 0) { isPlaying = false; shouldResumePlayback = false; persistMusicState(); syncPlaybackVisuals(); }
      }
      return;
    }
    if (event.origin !== 'https://www.youtube-nocookie.com') return;
    const info = data.info || data;
    const position = Number(info.currentTime ?? info.current_time);
    if (Number.isFinite(position) && position >= 0 && position < 86400) {
      savedPosition = position;
      persistMusicState();
    }
    if (data.event === 'onStateChange' && Number(data.info) === 1) {
      if (!shouldResumePlayback) return;
      isPlaying = true; persistMusicState(); syncPlaybackVisuals();
    } else if (data.event === 'onStateChange' && [0, 2, 5].includes(Number(data.info))) {
      isPlaying = false; shouldResumePlayback = false; persistMusicState(); syncPlaybackVisuals();
    }
  });
  directAudio?.addEventListener('timeupdate', () => { if (isDirectAudioTrack(activeTrack())) { savedPosition = Number(directAudio.currentTime) || 0; if (Date.now() % 2000 < 1000) persistMusicState(); } });
  directAudio?.addEventListener('play', () => { if (!pageIsLeaving && shouldResumePlayback && isDirectAudioTrack(activeTrack())) { isPlaying = true; syncPlaybackVisuals(); } });
  directAudio?.addEventListener('pause', () => { if (isDirectAudioTrack(activeTrack())) { isPlaying = false; shouldResumePlayback = false; syncPlaybackVisuals(); persistMusicState(); } });
  directAudio?.addEventListener('ended', () => { if (isDirectAudioTrack(activeTrack())) { isPlaying = false; shouldResumePlayback = false; syncPlaybackVisuals(); render(); } });
  directAudio?.addEventListener('error', () => {
    const track = activeTrack();
    if (!isDirectAudioTrack(track)) return;
    isPlaying = false; shouldResumePlayback = false;
    setPlaybackStatus(tr('Không tải được MP3. Kiểm tra URL tệp, quyền truy cập và tên file trên website.', 'Không tải được MP3. Kiểm tra URL tệp, quyền truy cập và tên file trên website.'));
    syncPlaybackVisuals(); persistMusicState(); render();
  });
  // Refresh the in-memory timestamp while this page stays open; nothing is written to storage.
  playbackStateSaveTimer = window.setInterval(requestPlayerPosition, 1800);
  function stopPlaybackForPageExit() {
    pageIsLeaving = true;
    isPlaying = false;
    shouldResumePlayback = false;
    currentTrack = '';
    savedPosition = 0;
    try {
      directAudio?.pause();
      if (directAudio) { directAudio.removeAttribute('src'); directAudio.load(); }
      if (player) player.src = 'about:blank';
    } catch {}
    if (panel) { panel.classList.add('hidden'); panel.classList.remove('is-opening', 'is-closing'); }
    dock.classList.remove('is-playing', 'music-centered', 'music-opening', 'is-closing', 'is-system-checking', 'is-system-closing', 'is-system-complete');
    dynamicNav?.classList.remove('music-system-checking', 'music-nav-morphing', 'music-nav-restoring');
    setCollapsed(true);
    syncPlaybackVisuals();
    clearLegacyMusicState();
  }
  window.addEventListener('pagehide', stopPlaybackForPageExit, { capture: true });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    pageIsLeaving = false;
    isPlaying = false; shouldResumePlayback = false; currentTrack = ''; savedPosition = 0;
    if (panel) { panel.classList.add('hidden'); panel.classList.remove('is-opening', 'is-closing'); }
    if (player) player.src = 'about:blank';
    setCollapsed(true); syncPlaybackVisuals(); render(); clearLegacyMusicState();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') requestPlayerPosition(); });
  function playTrack(trackId) {
    const track = tracks.find(row => row.id === trackId) || activeTrack();
    if (!track) return;
    // Clicking the currently playing row toggles pause at the exact current position.
    // Clicking it again resumes from that point; selecting another row starts that song.
    if (track.id === currentTrack && isPlaying) { stopTrack(); return; }
    if (track.id === currentTrack && !isPlaying && isTikTokTrack(track) && track.videoId && player?.src.includes(`/player/v1/${encodeURIComponent(track.videoId)}`)) {
      player.contentWindow?.postMessage({ type: 'play', value: '', 'x-tiktok-player': true }, 'https://www.tiktok.com');
      isPlaying = true; shouldResumePlayback = true; hasPlaybackAttempt = true; persistMusicState(); syncPlaybackVisuals(); render(); return;
    }
    if (currentTrack !== track.id) savedPosition = 0;
    currentTrack = track.id;
    isPlaying = true;
    syncPlaybackVisuals();
    hasPlaybackAttempt = true;
    shouldResumePlayback = true;
    persistMusicState();
    const origin = encodeURIComponent(location.origin);
    const startAt = Math.max(0, Math.floor(savedPosition || 0));
    if (isDirectAudioTrack(track) && directAudio) {
      if (player) player.src = 'about:blank';
      const audioUrl = getDirectAudioUrl(track);
      if (!audioUrl) { isPlaying = false; shouldResumePlayback = false; setPlaybackStatus(tr('Đường dẫn MP3 không hợp lệ. Hãy kiểm tra tệp trong thư mục music/.', 'Đường dẫn MP3 không hợp lệ. Hãy kiểm tra tệp trong thư mục music/.')); syncPlaybackVisuals(); persistMusicState(); render(); return; }
      if (directAudioTrackId !== track.id || directAudio.src !== audioUrl) { directAudio.src = audioUrl; directAudio.currentTime = startAt; directAudioTrackId = track.id; }
      directAudio.play().catch(() => { isPlaying = false; shouldResumePlayback = false; syncPlaybackVisuals(); setPlaybackStatus(tr('Trình duyệt chưa phát được âm thanh. Nhấn phát lại để thử.', 'Trình duyệt chưa phát được âm thanh. Nhấn phát lại để thử.')); });
    } else if (isSoundCloudTrack(track)) {
      if (directAudio) directAudio.pause();
      if (player) player.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&visual=false`;
      savedPosition = 0;
    } else if (isTikTokTrack(track)) {
      if (directAudio) directAudio.pause();
      if (!track.videoId) {
        if (player) player.src = 'about:blank';
        isPlaying = false;
        shouldResumePlayback = false;
        setPlaybackStatus(tr('Liên kết TikTok rút gọn không cung cấp mã video để nhúng. Nhấn “Mở nguồn” để nghe trên TikTok.', 'Liên kết TikTok rút gọn không cung cấp mã video để nhúng. Nhấn “Mở nguồn” để nghe trên TikTok.'));
        persistMusicState(); syncPlaybackVisuals(); render();
        return;
      } else if (player) {
        player.src = `https://www.tiktok.com/player/v1/${encodeURIComponent(track.videoId)}?autoplay=1&controls=1&loop=0&music_info=1&description=1`;
        savedPosition = 0;
      } else {
        isPlaying = false; shouldResumePlayback = false;
        setPlaybackStatus(tr('Không tìm thấy khung phát TikTok trên trang này.', 'Không tìm thấy khung phát TikTok trên trang này.'));
        persistMusicState(); syncPlaybackVisuals(); render(); return;
      }
    } else {
      if (directAudio) directAudio.pause();
      const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(track.videoId)}?autoplay=1&controls=1&rel=0&playsinline=1&modestbranding=1&loop=1&playlist=${encodeURIComponent(track.videoId)}&enablejsapi=1&origin=${origin}&start=${startAt}`;
      if (player) {
        const currentSrc = player.getAttribute('src') || '';
        const sameTrackLoaded = currentSrc.includes(`/embed/${encodeURIComponent(track.videoId)}`) && currentSrc !== 'about:blank';
        if (sameTrackLoaded) player.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), 'https://www.youtube-nocookie.com');
        else player.src = src;
      }
    }
    setPlaybackStatus(tr('Đang phát bài đã chọn.', 'Đang phát bài đã chọn.'));
    render();
  }
  function stopTrack() {
    // Ask YouTube for the freshest timestamp before pausing, then persist it.
    const track = activeTrack();
    if (directAudio && !directAudio.paused && isDirectAudioTrack(track)) { savedPosition = Number(directAudio.currentTime) || savedPosition; directAudio.pause(); }
    else if (!isTikTokTrack(track)) requestPlayerPosition();
    // Pause the current source without resetting its position.
    if (player && player.src !== 'about:blank' && !isDirectAudioTrack(track)) {
      if (isTikTokTrack(track)) player.contentWindow?.postMessage({ type: 'pause', value: '', 'x-tiktok-player': true }, 'https://www.tiktok.com');
      else player.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), 'https://www.youtube-nocookie.com');
    }
    isPlaying = false;
    shouldResumePlayback = false;
    persistMusicState();
    syncPlaybackVisuals();
    setPlaybackStatus(tr('Đã tắt nhạc.', 'Đã dừng nhạc.'));
    render();
  }
  window.addEventListener('fishcat:language-changed', () => { syncMusicLanguage(); render(); });
  window.addEventListener('storage', event => { if (event.key === 'fishcat-language-v1455') { syncMusicLanguage(); render(); } });
  async function loadLibrary() {
    const candidates = [
      { url: `/api/music/tracks?__refresh=${Date.now()}`, managed: true, credentials: 'same-origin' },
      { url: `./data/music-tracks.json?__refresh=${Date.now()}`, managed: false }
    ];
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate.url, { cache: 'no-store', ...(candidate.credentials ? { credentials: candidate.credentials } : {}) });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data?.tracks)) continue;
        if (candidate.managed) {
          const managed = data.tracks.filter(track => track.id !== 'supermode' && track.videoId !== 'tWK8kLIYxF0' && !/supermode/i.test(String(track.artist || '')));
          const seenVideoIds = new Set(managed.map(track => track.videoId).filter(Boolean));
          tracks = [...managed, ...RECOMMENDED_TRACKS.filter(track => !seenVideoIds.has(track.videoId))];
        } else {
          tracks = data.tracks;
        }
        break;
      } catch { /* Try the next source, especially the static JSON on GitHub Pages. */ }
    }
    // The library may refresh while the page is active, but playback selection and
    // progress never persist across a full reload. No track is auto-selected or resumed.
    if (!tracks.some(track => String(track.id) === currentTrack)) {
      currentTrack = ''; savedPosition = 0; shouldResumePlayback = false;
    }
    render();
  }
  async function initializePublicPlayer() {
    clearLegacyMusicState();
    dock.classList.remove('hidden', 'music-public-pending', 'is-playing', 'music-centered', 'music-opening', 'is-closing');
    dock.classList.add('music-public-ready');
    if (panel) { panel.classList.add('hidden'); panel.classList.remove('is-opening', 'is-closing'); }
    currentTrack = ''; savedPosition = 0; shouldResumePlayback = false; isPlaying = false;
    syncPlaybackVisuals();
    setCollapsed(true);
    await loadLibrary();
    syncMusicLanguage();
  }
  // Stop synthetic clicks as well as physical clicks while the whole dock is
  // locked. This also protects against nested controls or other scripts calling
  // click() before the transition lock has expired.
  const blockDockInteraction = event => {
    if (!islandTransitionLocked && !dock.classList.contains('is-system-checking')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend',
    'keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'change', 'submit', 'paste', 'cut', 'drop', 'contextmenu']
    .forEach(type => dock.addEventListener(type, blockDockInteraction, true));
  document.addEventListener('focusin', event => {
    if (!islandTransitionLocked || !dock.contains(event.target) || event.target === island) return;
    event.stopImmediatePropagation();
    event.target.blur?.();
    island?.focus({ preventScroll: true });
  }, true);
  island?.addEventListener('click', handleIslandToggle);
  $('#closeMusicPanel')?.addEventListener('click', beginIslandClose);
  playbackToggle?.addEventListener('click', () => { if (isPlaying) stopTrack(); else if (currentTrack) playTrack(currentTrack); else if (panel?.classList.contains('hidden')) handleIslandToggle(); });
  list?.addEventListener('click', event => { const button = event.target.closest('[data-music-track]'); if (button) playTrack(button.dataset.musicTrack); });
  $('#musicSearchForm')?.addEventListener('submit', event => {
    event.preventDefault(); query = String(search?.value || '').trim().toLowerCase(); render();
    if (!tracks.some(track => `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(query)) && query) { const link = $('#musicDiscover'); if (link) window.open(link.href, '_blank', 'noopener,noreferrer'); }
  });
  search?.addEventListener('input', () => { query = String(search.value || '').trim().toLowerCase(); render(); });
  // Close finalization is timer-backed (morph duration + settle margin) so it cannot
  // remove the overlay one frame before dock width/height transitions finish.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !islandTransitionLocked && !panel?.classList.contains('hidden')) beginIslandClose();
  });
  window.addEventListener('fishcat:music-library-updated', loadLibrary);
  window.addEventListener('executor:music-play', async event => { const id = String(event.detail?.id || ''); let track = tracks.find(item => String(item.id) === id); if (!track) { await loadLibrary(); track = tracks.find(item => String(item.id) === id); } if (track) playTrack(String(track.id)); else setPlaybackStatus('Không tìm thấy bài hát trong thư viện nhạc.'); });
  window.addEventListener('executor:music-stop', stopTrack);
  initializePublicPlayer();
})();
