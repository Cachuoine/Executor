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
  const islandTrackTitle = $('#musicIslandTrackTitle');
  const islandTrackArtist = $('#musicIslandTrackArtist');
  const islandRecordArt = $('#musicIslandRecordArt');
  islandRecordArt?.addEventListener('error', () => { islandRecordArt.hidden = true; islandRecordArt.closest('.music-island-record')?.classList.remove('has-artwork'); });
  const panel = $('#musicPanel');
  const musicEngine = document.querySelector('.music-engine');
  let directAudio = document.getElementById('musicDirectAudio');
  if (!directAudio) {
    directAudio = document.createElement('audio');
    directAudio.id = 'musicDirectAudio';
    directAudio.preload = 'metadata';
    directAudio.hidden = true;
    musicEngine?.appendChild(directAudio);
  }
  const islandRecord = $('.music-island-record');
  // Keep one persistent rotation timeline for the vinyl. Pausing the Web Animation
  // freezes its exact currentTime/angle; CSS class changes and closing the island
  // cannot restart it at zero degrees.
  const recordRotation = islandRecord && typeof islandRecord.animate === 'function'
    ? islandRecord.animate(
      [{ rotate: '0deg' }, { rotate: '360deg' }],
      { duration: 5800, iterations: Infinity, easing: 'linear', fill: 'both' }
    )
    : null;
  recordRotation?.pause();
  // The Dynamic no longer exposes a volume widget. Keep a comfortable default
  // level and clear stale mute/volume preferences left by older builds.
  try { localStorage.removeItem('nightreaper-music-volume-v1'); } catch {}
  directAudio.volume = 0.8;
  directAudio.muted = false;

  function resetPlaybackVisuals() {
    if (!islandRecord || !recordRotation) return;
    // A newly selected song starts with a clean record; normal pause/resume never
    // calls this, so the current angle is preserved exactly between playback states.
    try {
      recordRotation.pause();
      recordRotation.currentTime = 0;
    } catch {}
  }
  function startPlaybackVisuals() {
    // Resume the same timeline instead of creating a fresh CSS animation.
    try { recordRotation?.play(); } catch {}
  }
  function stopPlaybackVisuals() {
    // WAAPI pause retains the exact frame/angle, including if playback stops during
    // the same frame that the library begins closing.
    try { recordRotation?.pause(); } catch {}
  }
  resetPlaybackVisuals();
  let directAudioTrackId = '';
  const getDirectAudioUrl = track => {
    if (!track || track.videoId || !['audio', 'external', 'link'].includes(String(track.sourceType || ''))) return '';
    try {
      const url = new URL(String(track.url || ''), document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return '';
      return url.href;
    } catch { return ''; }
  };
  const isDirectAudioTrack = track => Boolean(getDirectAudioUrl(track));
  const search = $('#musicSearch');
  const list = $('#musicTrackList');
  let pendingTrackRevealId = '';
  const playbackStatus = $('#musicPlaybackStatus');
  const playbackModeToggle = $('#musicPlaybackModeToggle');
  const searchMorph = $('#musicSearchForm');
  const searchToggle = $('#musicSearchToggle');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const LOCAL_ARTWORK_PATTERN = /^\.\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|gif|webp|avif|bmp|tiff?|ico|heic|heif|jxl|svg)$/i;
  function getTrackArtworkUrl(track) {
    const value = String(track?.artworkUrl || '').trim();
    return LOCAL_ARTWORK_PATTERN.test(value) ? value : '';
  }
  const miniPlayer = $('#musicNowPlayingMini');
  const miniArtwork = $('#musicNowPlayingArt');
  const miniArtworkFallback = $('#musicNowPlayingArtFallback');
  const miniTitle = $('#musicNowPlayingTitle');
  const miniArtist = $('#musicNowPlayingArtist');
  const miniSeek = $('#musicNowPlayingSeek');
  const miniElapsed = $('#musicNowPlayingElapsed');
  const miniDuration = $('#musicNowPlayingDuration');
  const miniSource = $('#musicNowPlayingSource');
  const FALLBACK = []; // The Admin-managed public library can contain local MP3s or external HTTP(S) links.
  // The library is managed by Admin; deleted tracks are never silently restored.
  let tracks = [];
  const MUSIC_STATE_KEY = 'fishcat-music-playback-state-v1';
  const MUSIC_FAVORITES_KEY = 'executor-music-favorite-ids-v1';
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
  function getMusicFavoriteIds() {
    try {
      const value = JSON.parse(localStorage.getItem(MUSIC_FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []);
    } catch { return new Set(); }
  }
  function publishMusicFavorites() {
    const ids = getMusicFavoriteIds();
    const favoriteTracks = tracks.filter(track => ids.has(String(track.id))).map(track => ({
      id: String(track.id), title: String(track.title || 'Bài hát chưa đặt tên'),
      artist: String(track.artist || 'Chưa rõ nghệ sĩ'), genre: String(track.genre || ''),
      url: String(track.url || ''), artworkUrl: getTrackArtworkUrl(track)
    }));
    window.dispatchEvent(new CustomEvent('executor:music-favorites-updated', { detail: { tracks: favoriteTracks, ids: [...ids] } }));
  }
  function toggleMusicFavorite(trackId) {
    const id = String(trackId || '');
    if (!id || !tracks.some(track => String(track.id) === id)) return;
    const favorites = getMusicFavoriteIds();
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    try { localStorage.setItem(MUSIC_FAVORITES_KEY, JSON.stringify([...favorites])); } catch {}
    render();
    publishMusicFavorites();
  }
  let currentTrack = '';
  let savedPosition = 0;
  let shouldResumePlayback = false;
  let pageIsLeaving = false;
  let query = '';
  let libraryMode = 'all';
  let hasPlaybackAttempt = false;
  let isPlaying = false;
  // Animate each decorative bar independently. WAAPI pause/resume preserves each
  // animation's exact currentTime, avoiding CSS play-state snapping on audio pause.
  const waveformConfigs = [
    { min: 43, max: 18, duration: 860, phase: 180 },
    { min: 30, max: 5, duration: 1080, phase: 540 },
    { min: 38, max: 12, duration: 940, phase: 330 },
    { min: 20, max: 0, duration: 1160, phase: 680 },
    { min: 32, max: 8, duration: 890, phase: 410 },
    { min: 26, max: 4, duration: 1040, phase: 130 },
    { min: 42, max: 16, duration: 910, phase: 590 }
  ];
  const waveformAnimations = Array.from(dock.querySelectorAll('.music-island-wave i')).map((bar, index) => {
    if (typeof bar.animate !== 'function') return null;
    const config = waveformConfigs[index] || waveformConfigs[0];
    const inset = value => `inset(${value}% 0 ${value}% 0 round 4px)`;
    try {
      const animation = bar.animate([
        { clipPath: inset(config.min), filter: 'brightness(.88)' },
        { clipPath: inset(config.max), filter: 'brightness(1.22)' }
      ], {
        duration: config.duration, delay: -config.phase, iterations: Infinity,
        direction: 'alternate', easing: 'ease-in-out', fill: 'both'
      });
      animation.pause();
      return animation;
    } catch { return null; }
  });
  function syncWaveformPlayback() {
    const shouldAnimate = Boolean(currentTrack && isPlaying && directAudio && !directAudio.paused);
    for (const animation of waveformAnimations) {
      if (!animation) continue;
      try {
        if (shouldAnimate && animation.playState !== 'running') animation.play();
        else if (!shouldAnimate && animation.playState !== 'paused') animation.pause();
      } catch {}
    }
  }
  // Dynamic defaults to random next-track playback; the footer control toggles repeat-one.
  let playbackMode = 'shuffle';
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
    if (islandTransitionLocked) return;
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
    const status = $('#musicPlaybackStatus'); if (status && !isPlaying && !hasPlaybackAttempt) status.textContent = 'Chọn một bài hát để phát.';
    syncPlaybackModeControl();
  }
  function tr(vi, en) { return vi; }
  function syncPlaybackModeControl() {
    const button = playbackModeToggle || $('#musicPlaybackModeToggle');
    if (!button) return;
    const repeatOne = playbackMode === 'repeat';
    button.dataset.playbackMode = playbackMode;
    button.setAttribute('aria-pressed', String(repeatOne));
    button.setAttribute('aria-label', repeatOne ? 'Chế độ lặp lại một bài' : 'Chế độ chuyển bài ngẫu nhiên');
    button.title = repeatOne ? 'Lặp lại liên tục bài đang chọn' : 'Chuyển ngẫu nhiên sang một bài khác khi bài hiện tại kết thúc';
    const label = $('#musicPlaybackModeLabel');
    if (label) label.textContent = repeatOne ? 'REPEAT ONE' : 'RANDOM NEXT';
  }
  function togglePlaybackMode() {
    playbackMode = playbackMode === 'shuffle' ? 'repeat' : 'shuffle';
    if (directAudio) directAudio.loop = playbackMode === 'repeat';
    syncPlaybackModeControl();
    const button = playbackModeToggle || $('#musicPlaybackModeToggle');
    if (button) {
      button.classList.remove('is-switching');
      void button.offsetWidth;
      button.classList.add('is-switching');
      window.setTimeout(() => button.classList.remove('is-switching'), 560);
    }
    setPlaybackStatus(playbackMode === 'repeat' ? 'Đã bật lặp lại bài đang chọn.' : 'Đã bật chuyển tiếp ngẫu nhiên khi hết bài.');
    render();
  }
  function setPlaybackStatus(message) { if (playbackStatus) playbackStatus.textContent = message; }
  function updateDynamicTrackDisplay(track = activeTrack()) {
    const hasTrack = Boolean(track);
    dock.classList.toggle('has-track', hasTrack);
    dock.classList.toggle('is-playing', Boolean(hasTrack && isPlaying));
    if (islandTrackTitle) islandTrackTitle.textContent = hasTrack ? String(track.title || 'Bài hát chưa đặt tên') : '';
    if (islandTrackArtist) islandTrackArtist.textContent = hasTrack ? String(track.artist || 'Chưa rõ nghệ sĩ') : '';
    if (islandRecordArt) {
      const artworkUrl = getTrackArtworkUrl(track);
      islandRecordArt.closest('.music-island-record')?.classList.toggle('has-artwork', Boolean(artworkUrl));
      if (artworkUrl) {
        if (islandRecordArt.getAttribute('src') !== artworkUrl) islandRecordArt.src = artworkUrl;
        islandRecordArt.hidden = false;
        islandRecordArt.alt = '';
      } else {
        islandRecordArt.hidden = true;
        islandRecordArt.removeAttribute('src');
        islandRecordArt.alt = '';
      }
    }
    if (island) island.setAttribute('aria-label', panel && !panel.classList.contains('hidden')
      ? (hasTrack ? `Đang mở thư viện: ${track.title || 'Bài hát'}, ${track.artist || 'Chưa rõ nghệ sĩ'}` : 'Đang mở thư viện nhạc')
      : 'Mở thư viện nhạc');
  }
  function syncPlaybackVisuals() {
    // Dynamic is a pure open/close trigger while collapsed; expanded state becomes a mini player:
    // the compact capsule stays blank. When expanded, it becomes a mini player:
    // the vinyl spins, the selected track is named, and the decorative waveform
    // runs independently from MP3 levels and freezes at its exact frame on pause.
    const track = activeTrack();
    updateDynamicTrackDisplay(track);
    syncWaveformPlayback();
    if (isPlaying && !directAudio?.paused) startPlaybackVisuals();
    else stopPlaybackVisuals();
    window.dispatchEvent(new CustomEvent('executor:music-playback-state', {
      detail: {
        trackId: String(currentTrack || ''),
        isPlaying: Boolean(isPlaying && currentTrack),
        title: String(track?.title || ''),
        artist: String(track?.artist || ''),
        mode: playbackMode
      }
    }));
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
    dock.style.setProperty('width', `${rect.width}px`, 'important');
    dock.style.setProperty('height', `${rect.height}px`, 'important');
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
  // The fingerprint galaxy no longer invokes a separate Dynamic loading sequence.
  function openMusicCenter() {
    updateDynamicTrackDisplay(activeTrack());
    if (currentTrack) { prepareCurrentTrackReveal(); render(); }
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
      if (currentTrack) { pendingTrackRevealId = String(currentTrack); requestAnimationFrame(revealCurrentTrackInLibrary); }
    }));
    setCollapsed(false);
  }
  function finishMusicCenterClose() {
    closeMusicSearch({ clear:true, rerender:false });
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
    // Capture the currently rendered dock dimensions before the close class changes
    // layout constraints. Freeze them with inline !important so stylesheet width rules
    // cannot snap the capsule to its collapsed size on the first closing frame.
    freezeDockSizeForClose();
    void dock.offsetWidth;
    // Close in parallel: the library shrinks back to its center, the pill contracts,
    // and both navigation wings return in this same frame (the inverse of opening).
    panel.classList.remove('is-opening');
    panel.classList.add('is-closing');
    dock.classList.add('is-closing');
    dynamicNav?.classList.add('music-nav-restoring');
    dynamicNav?.classList.remove('music-nav-morphing');
    // Let the browser measure the frozen open geometry, then release the inline
    // override so the closing CSS target can animate from that exact first frame.
    void dock.offsetWidth;
    restoreDockSizeAfterClose();
    if (island) {
      island.setAttribute('aria-expanded', 'false');
      island.setAttribute('aria-label', tr('Mở thư viện nhạc', 'Mở thư viện nhạc'));
    }

    // The three animations run concurrently, so finalize after the longest one settles.
    // This timer is also a fallback if the browser cancels an animation event.
    panelCloseTimer = setTimeout(finishMusicCenterClose, Math.max(getLibraryRevealDurationMs(), getIslandMorphDurationMs()) + 150);
  }
  function activeTrack() { return currentTrack ? (tracks.find(track => track.id === currentTrack) || null) : null; }
  function formatMusicTime(value) {
    const safe = Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
    const minutes = Math.floor(safe / 60);
    const seconds = String(safe % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
  function updateMiniNowPlaying() {
    if (!miniPlayer) return;
    const track = activeTrack();
    miniPlayer.hidden = !track;
    if (!track) {
      if (miniSeek) { miniSeek.value = '0'; miniSeek.disabled = true; miniSeek.style.setProperty('--music-mini-progress', '0%'); }
      if (miniElapsed) miniElapsed.textContent = '0:00';
      if (miniDuration) miniDuration.textContent = '0:00';
      if (miniSource) { miniSource.hidden = true; miniSource.removeAttribute('href'); }
      return;
    }
    if (miniTitle) miniTitle.textContent = String(track.title || 'Bài hát chưa đặt tên');
    if (miniArtist) miniArtist.textContent = String(track.artist || 'Chưa rõ nghệ sĩ');
    const artworkUrl = getTrackArtworkUrl(track);
    if (miniArtwork) {
      if (artworkUrl) {
        if (miniArtwork.getAttribute('src') !== artworkUrl) miniArtwork.src = artworkUrl;
        miniArtwork.hidden = false;
        if (miniArtworkFallback) miniArtworkFallback.hidden = true;
      } else {
        miniArtwork.hidden = true;
        miniArtwork.removeAttribute('src');
        if (miniArtworkFallback) miniArtworkFallback.hidden = false;
      }
    }
    const audioMatchesTrack = directAudioTrackId === String(track.id);
    const duration = audioMatchesTrack && Number.isFinite(directAudio?.duration) ? directAudio.duration : 0;
    const currentTime = audioMatchesTrack && Number.isFinite(directAudio?.currentTime)
      ? directAudio.currentTime : savedPosition;
    const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
    if (miniSeek) {
      miniSeek.disabled = duration <= 0;
      miniSeek.value = String(Math.round(progress * 10));
      miniSeek.style.setProperty('--music-mini-progress', `${progress}%`);
    }
    if (miniElapsed) miniElapsed.textContent = formatMusicTime(currentTime);
    if (miniDuration) miniDuration.textContent = formatMusicTime(duration);
    if (miniSource) {
      let sourceHref = '';
      try {
        const source = new URL(String(track.sourceUrl || track.url || ''), document.baseURI);
        if (['http:', 'https:'].includes(source.protocol) && source.hostname && !source.username && !source.password) sourceHref = source.href;
      } catch {}
      miniSource.hidden = !sourceHref;
      if (sourceHref) miniSource.href = sourceHref;
      else miniSource.removeAttribute('href');
    }
  }
  function restartCurrentTrack(expectedTrackId = currentTrack) {
    const track = activeTrack();
    if (!track || track.id !== expectedTrackId || !shouldResumePlayback || pageIsLeaving || !directAudio) return false;
    savedPosition = 0;
    pendingTrackRevealId = String(track.id);
    prepareCurrentTrackReveal();
    isPlaying = false;
    try { directAudio.currentTime = 0; } catch {}
    directAudio.loop = true;
    directAudio.play().catch(() => {
      isPlaying = false;
      shouldResumePlayback = false;
      setPlaybackStatus(tr('Không thể tự phát lại nguồn âm thanh. Hãy nhấn phát để thử lại.', 'Không thể tự phát lại nguồn âm thanh. Hãy nhấn phát để thử lại.'));
      syncPlaybackVisuals(); render();
    });
    setPlaybackStatus(tr('Đã bật lặp lại bài đã chọn.', 'Đã bật lặp lại bài đã chọn.'));
    syncPlaybackVisuals();
    render();
    return true;
  }
  function prepareCurrentTrackReveal() {
    if (!currentTrack) return;
    pendingTrackRevealId = String(currentTrack);
    // A random next track may be outside the user's old search/favorites filter.
    // Switch to the full library so the active row can always be located.
    const hadFilter = query !== '' || libraryMode !== 'all';
    query = '';
    libraryMode = 'all';
    if (search && search.value) search.value = '';
    if (hadFilter) syncMusicLanguage();
  }
  function revealCurrentTrackInLibrary() {
    if (!list || !pendingTrackRevealId || panel?.classList.contains('hidden') || panel?.classList.contains('is-opening')) return;
    const target = [...list.querySelectorAll('.music-track-choice')].find(row => row.dataset.trackId === pendingTrackRevealId);
    if (!target && !tracks.some(track => String(track.id) === pendingTrackRevealId)) { pendingTrackRevealId = ''; return; }
    if (!target) {
      // A stale render can briefly race the library update; retry once after its next paint.
      const wanted = pendingTrackRevealId;
      requestAnimationFrame(() => { if (pendingTrackRevealId === wanted) revealCurrentTrackInLibrary(); });
      return;
    }
    const listRect = list.getBoundingClientRect();
    const rowRect = target.getBoundingClientRect();
    const nextTop = list.scrollTop + rowRect.top - listRect.top - Math.max(0, (list.clientHeight - rowRect.height) / 2);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: Math.max(0, nextTop), behavior: reduceMotion ? 'auto' : 'smooth' });
    list.querySelectorAll('.music-track-choice.is-current-reveal').forEach(row => row.classList.remove('is-current-reveal'));
    target.classList.add('is-current-reveal');
    pendingTrackRevealId = '';
  }

  function render() {
    // Always display tracks alphabetically, independent of pinning or insertion order.
    tracks.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base', numeric: true }));
    // Live-filter by title and artist while typing. Favorites are a separate folder
    // over the same track library; song favorites persist, playback state does not.
    const musicFavorites = getMusicFavoriteIds();
    const rows = tracks.filter(track => `${track.title} ${track.artist}`.toLowerCase().includes(query))
      .filter(track => libraryMode !== 'favorites' || musicFavorites.has(String(track.id)));
    const renderRows = (items, startIndex) => items.map((track, offset) => {
      const id = String(track.id);
      const favorite = musicFavorites.has(id);
      const artworkUrl = getTrackArtworkUrl(track);
      const trackBadge = artworkUrl
        ? `<span class="music-track-number music-track-number-art"><img src="${escapeHtml(artworkUrl)}" alt="" loading="lazy"></span>`
        : `<span class="music-track-number">${String(startIndex + offset + 1).padStart(2,'0')}</span>`;
      return `<div class="music-track-choice${id === currentTrack ? ' active is-current-track' : ''}${id === currentTrack && isPlaying ? ' is-playing' : ''}" data-track-id="${escapeHtml(id)}" aria-current="${id === currentTrack ? 'true' : 'false'}"><button type="button" class="music-track-main" data-music-track="${escapeHtml(id)}" aria-label="${escapeHtml(id === currentTrack && isPlaying ? `Tạm dừng ${track.title}` : `Phát ${track.title}`)}">${trackBadge}<span class="music-track-name"><b>${escapeHtml(track.title)}</b><small>${escapeHtml(track.artist)}</small></span><span class="music-track-play">${id === currentTrack && isPlaying ? 'Ⅱ' : '▶'}</span></button><button type="button" class="music-track-favorite${favorite ? ' is-favorite' : ''}" data-music-favorite="${escapeHtml(id)}" aria-pressed="${favorite}" aria-label="${favorite ? 'Bỏ khỏi nhạc yêu thích' : 'Thêm vào nhạc yêu thích'}" title="${favorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}">${favorite ? '♥' : '♡'}</button></div>`;
    }).join('');
    if (list) {
      if (!rows.length) list.innerHTML = `<div class="music-library-loading">${libraryMode === 'favorites' ? 'Chưa có bài hát yêu thích. Nhấn ♡ ở một bài hát để thêm vào thư mục này.' : 'Không tìm thấy bài hát phù hợp.'}</div>`;
      else list.innerHTML = renderRows(rows, 0);
    }
    const count = $('#musicLibraryCount');
    if (count) count.textContent = libraryMode === 'favorites' ? `${rows.length} bài yêu thích` : `${tracks.length} bài trong thư viện`;
    const favoriteCount = $('#musicFavoriteCount'); if (favoriteCount) favoriteCount.textContent = String(tracks.filter(track => musicFavorites.has(String(track.id))).length);
    document.querySelectorAll('[data-music-filter]').forEach(button => {
      const active = button.dataset.musicFilter === libraryMode;
      button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
    });
    syncMusicLanguage();
    const track = activeTrack();
    syncPlaybackModeControl();
    updateDynamicTrackDisplay(track);
    updateMiniNowPlaying();
    if (pendingTrackRevealId) requestAnimationFrame(revealCurrentTrackInLibrary);
  }
  function persistMusicState() {
    // Backward-compatible event-hook target only. Playback state is memory-only;
    // writes to localStorage are intentionally disabled.
  }
  function requestPlayerPosition() {
    if (!directAudio || directAudio.paused) return;
    const position = Number(directAudio.currentTime);
    if (Number.isFinite(position) && position >= 0) savedPosition = position;
  }
  directAudio?.addEventListener('timeupdate', () => {
    if (!isDirectAudioTrack(activeTrack())) return;
    savedPosition = Number(directAudio.currentTime) || 0;
    updateMiniNowPlaying();
  });
  directAudio?.addEventListener('loadedmetadata', updateMiniNowPlaying);
  directAudio?.addEventListener('durationchange', updateMiniNowPlaying);
  directAudio?.addEventListener('seeked', updateMiniNowPlaying);
  directAudio?.addEventListener('playing', () => {
    if (!pageIsLeaving && shouldResumePlayback && isDirectAudioTrack(activeTrack())) {
      isPlaying = true;
      syncPlaybackVisuals();
      render();
    }
  });
  directAudio?.addEventListener('pause', () => {
    if (!directAudio.paused) return;
    stopPlaybackVisuals();
    if (!pageIsLeaving && isDirectAudioTrack(activeTrack())) {
      savedPosition = Number(directAudio.currentTime) || savedPosition;
      isPlaying = false;
      // A real pause freezes the vinyl at its current angle and keeps the selected
      // track visible. A pending track switch will set shouldResumePlayback again.
      shouldResumePlayback = Boolean(directAudio.ended);
      syncPlaybackVisuals();
      persistMusicState();
      render();
    }
  });
  function playRandomNextTrack() {
    const available = tracks.filter(track => isDirectAudioTrack(track));
    if (!available.length) { stopTrack(); return; }
    const alternatives = available.filter(track => String(track.id) !== String(currentTrack));
    const pool = alternatives.length ? alternatives : available;
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) { stopTrack(); return; }
    if (String(next.id) === String(currentTrack)) {
      restartCurrentTrack(currentTrack);
      return;
    }
    setPlaybackStatus(`Đã hết bài · chuyển ngẫu nhiên sang ${next.title}.`);
    playTrack(String(next.id));
  }
  directAudio?.addEventListener('ended', () => {
    if (!isDirectAudioTrack(activeTrack())) return;
    if (!shouldResumePlayback) { isPlaying = false; syncPlaybackVisuals(); render(); return; }
    if (playbackMode === 'repeat') restartCurrentTrack(currentTrack);
    else playRandomNextTrack();
  });
  directAudio?.addEventListener('error', () => {
    const track = activeTrack();
    if (!isDirectAudioTrack(track)) return;
    isPlaying = false; shouldResumePlayback = false;
    setPlaybackStatus(tr('Không tải được nguồn âm thanh. Hãy kiểm tra URL hoặc mở liên kết Nguồn nhạc để nghe trên trang gốc.', 'Không tải được nguồn âm thanh. Hãy kiểm tra URL hoặc mở liên kết Nguồn nhạc để nghe trên trang gốc.'));
    syncPlaybackVisuals(); persistMusicState(); render();
  });
  // Native audio timeupdate events keep the position current without a polling timer.
  function stopPlaybackForPageExit() {
    pageIsLeaving = true;
    isPlaying = false;
    shouldResumePlayback = false;
    currentTrack = '';
    savedPosition = 0;
    stopPlaybackVisuals();
    try {
      directAudio?.pause();
      if (directAudio) { directAudio.removeAttribute('src'); directAudio.load(); }
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
    setCollapsed(true); syncPlaybackVisuals(); render(); clearLegacyMusicState();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') requestPlayerPosition(); });
  function closeMusicSearch({ clear = true, rerender = false } = {}) {
    if (!searchMorph) return;
    const wasOpen = searchMorph.classList.contains('is-open');
    searchMorph.classList.remove('is-open');
    searchToggle?.setAttribute('aria-expanded', 'false');
    searchToggle?.setAttribute('aria-label', 'Mở tìm kiếm');
    if (search) {
      search.tabIndex = -1;
      if (clear) {
        const hadQuery = Boolean(search.value || query);
        search.value = '';
        query = '';
        if (rerender && hadQuery) render();
      }
    }
    return wasOpen;
  }
  function openMusicSearch() {
    if (!searchMorph) return;
    searchMorph.classList.add('is-open');
    searchToggle?.setAttribute('aria-expanded', 'true');
    searchToggle?.setAttribute('aria-label', 'Đóng tìm kiếm');
    if (search) { search.tabIndex = 0; requestAnimationFrame(() => search.focus({ preventScroll:true })); }
  }
  function playTrack(trackId) {
    // Selecting a result collapses the search bubble with the reverse morph. The
    // Dynamic capsule remains blank; track details are kept inside the library only.
    closeMusicSearch({ clear:true, rerender:false });
    const track = tracks.find(row => row.id === trackId) || activeTrack();
    const audioUrl = getDirectAudioUrl(track);
    if (!track || !audioUrl || !directAudio) {
      setPlaybackStatus('URL không hợp lệ hoặc chưa được trình duyệt hỗ trợ làm nguồn âm thanh.');
      return;
    }
    if (track.id === currentTrack && isPlaying) { stopTrack(); return; }

    const isNewTrack = currentTrack !== track.id || directAudioTrackId !== track.id || directAudio.src !== audioUrl;
    if (isNewTrack) {
      try { directAudio.pause(); } catch {}
      stopPlaybackVisuals();
      resetPlaybackVisuals();
      savedPosition = 0;
      directAudio.src = audioUrl;
      directAudioTrackId = track.id;
    }

    currentTrack = track.id;
    prepareCurrentTrackReveal();
    directAudio.loop = playbackMode === 'repeat';
    if (isNewTrack) {
      try { directAudio.currentTime = 0; } catch {}
    } else if (Number.isFinite(savedPosition) && savedPosition > 0) {
      try { directAudio.currentTime = savedPosition; } catch {}
    }
    isPlaying = false;
    shouldResumePlayback = true;
    hasPlaybackAttempt = true;
    persistMusicState();
    syncPlaybackVisuals();
    directAudio.play().catch(() => {
      isPlaying = false;
      shouldResumePlayback = false;
      syncPlaybackVisuals();
      setPlaybackStatus(tr('Trình duyệt chưa phát được nguồn này. Link nguồn vẫn có thể mở riêng để nghe.', 'Trình duyệt chưa phát được nguồn này. Link nguồn vẫn có thể mở riêng để nghe.'));
      render();
    });
    setPlaybackStatus(tr('Đã chọn nguồn nhạc.', 'Đã chọn nguồn nhạc.'));
    render();
  }
  function playAdjacentTrack(direction) {
    const available = tracks
      .filter(track => isDirectAudioTrack(track))
      .slice()
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base', numeric: true }));
    if (!available.length) return;
    const currentIndex = available.findIndex(track => String(track.id) === String(currentTrack));
    const nextIndex = currentIndex < 0
      ? (direction >= 0 ? 0 : available.length - 1)
      : (currentIndex + direction + available.length) % available.length;
    const nextTrack = available[nextIndex];
    if (!nextTrack) return;
    // With a one-song library, previous/next restarts the same song instead
    // of calling playTrack() on the already-playing item and accidentally pausing it.
    if (String(nextTrack.id) === String(currentTrack) && directAudio && !directAudio.paused) {
      seekCurrentTrack(0);
      return;
    }
    playTrack(String(nextTrack.id));
  }
  function seekCurrentTrack(seconds) {
    const track = activeTrack();
    const duration = Number(directAudio?.duration);
    if (!track || !isDirectAudioTrack(track) || !Number.isFinite(duration) || duration <= 0) return;
    const nextTime = Math.max(0, Math.min(duration, Number(seconds) || 0));
    try {
      directAudio.currentTime = nextTime;
      savedPosition = nextTime;
      updateMiniNowPlaying();
    } catch {}
  }
  function stopTrack() {
    const track = activeTrack();
    if (directAudio && !directAudio.paused && isDirectAudioTrack(track)) {
      savedPosition = Number(directAudio.currentTime) || savedPosition;
    }
    shouldResumePlayback = false;
    isPlaying = false;
    try { directAudio?.pause(); } catch {}
    persistMusicState();
    syncPlaybackVisuals();
    setPlaybackStatus(tr('Đã tắt nhạc.', 'Đã dừng nhạc.'));
    render();
  }
  window.addEventListener('fishcat:language-changed', () => { syncMusicLanguage(); render(); });
  window.addEventListener('storage', event => {
    if (event.key === 'fishcat-language-v1455') { syncMusicLanguage(); render(); }
    if (event.key === MUSIC_FAVORITES_KEY) { render(); publishMusicFavorites(); }
  });
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
        tracks = data.tracks.filter(track => Boolean(getDirectAudioUrl(track)));
        break;
      } catch { /* Try the next source, especially the static JSON on GitHub Pages. */ }
    }
    // The library may refresh while the page is active, but playback selection and
    // progress never persist across a full reload. No track is auto-selected or resumed.
    if (!tracks.some(track => String(track.id) === currentTrack)) {
      currentTrack = ''; savedPosition = 0; shouldResumePlayback = false;
    }
    render();
    publishMusicFavorites();
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
    if (!islandTransitionLocked) return;
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
  $('#closeMusicPanel')?.addEventListener('click', () => { closeMusicSearch({ clear:true, rerender:false }); beginIslandClose(); });
  playbackModeToggle?.addEventListener('click', togglePlaybackMode);
  miniSeek?.addEventListener('input', () => {
    const track = activeTrack();
    const duration = Number(directAudio?.duration);
    if (!track || directAudioTrackId !== String(track.id) || !Number.isFinite(duration) || duration <= 0) return;
    const previewTime = (Number(miniSeek.value) / 1000) * duration;
    if (miniElapsed) miniElapsed.textContent = formatMusicTime(previewTime);
    miniSeek.style.setProperty('--music-mini-progress', `${Math.max(0, Math.min(100, Number(miniSeek.value) / 10))}%`);
  });
  miniSeek?.addEventListener('change', () => {
    const duration = Number(directAudio?.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;
    seekCurrentTrack((Number(miniSeek.value) / 1000) * duration);
  });
  searchMorph?.addEventListener('click', event => {
    // Keep clicks on the icon, input, caret and the morph surface inside this control.
    // Only a deliberate click/pointer outside the bubble is allowed to collapse it.
    event.stopPropagation();
  });
  searchToggle?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (searchMorph?.classList.contains('is-open')) closeMusicSearch({ clear:true, rerender:true });
    else openMusicSearch();
  });
  search?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && searchMorph?.classList.contains('is-open')) {
      event.preventDefault(); event.stopPropagation(); closeMusicSearch({ clear:true, rerender:true });
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!searchMorph?.classList.contains('is-open')) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && (searchMorph.contains(target) || target.closest('#musicSearchForm') || target.closest('#musicTrackList'))) return;
    closeMusicSearch({ clear:true, rerender:true });
  }, true);
  list?.addEventListener('click', event => { const button = event.target.closest('[data-music-track]'); if (button) playTrack(button.dataset.musicTrack); });
  search?.addEventListener('input', () => { query = String(search.value || '').trim().toLowerCase(); render(); });
  document.addEventListener('click', event => {
    const favoriteButton = event.target.closest('[data-music-favorite]');
    if (favoriteButton) { event.preventDefault(); event.stopPropagation(); toggleMusicFavorite(favoriteButton.dataset.musicFavorite); return; }
    const filterButton = event.target.closest('[data-music-filter]');
    if (filterButton && dock.contains(filterButton)) {
      event.preventDefault(); libraryMode = filterButton.dataset.musicFilter === 'favorites' ? 'favorites' : 'all'; render();
      return;
    }
    const wingPlayButton = event.target.closest('[data-wing-music-play]');
    if (wingPlayButton) { event.preventDefault(); playTrack(String(wingPlayButton.dataset.wingMusicPlay || '')); }
  });
  // Close finalization is timer-backed (morph duration + settle margin) so it cannot
  // remove the overlay one frame before dock width/height transitions finish.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && searchMorph?.classList.contains('is-open')) return;
    if (event.key === 'Escape' && !islandTransitionLocked && !panel?.classList.contains('hidden')) { closeMusicSearch({ clear:true, rerender:false }); beginIslandClose(); }
  });
  window.addEventListener('fishcat:music-library-updated', loadLibrary);
  window.addEventListener('executor:music-play', async event => { const id = String(event.detail?.id || ''); let track = tracks.find(item => String(item.id) === id); if (!track) { await loadLibrary(); track = tracks.find(item => String(item.id) === id); } if (track) playTrack(String(track.id)); else setPlaybackStatus('Không tìm thấy bài hát trong thư viện nhạc.'); });
  window.addEventListener('executor:music-stop', stopTrack);
  syncPlaybackModeControl();
  initializePublicPlayer();
})();
