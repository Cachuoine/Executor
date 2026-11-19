/* Shared Roblox version formatter for the Local site, Admin, GitHub Pages and Discord embeds. */
(function attachRobloxVersionDisplay(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NightReaperRobloxVersionDisplay = api;
})(typeof window !== 'undefined' ? window : null, function createRobloxVersionDisplay() {
  const DESKTOP_PLATFORMS = new Set(['PC', 'macOS']);

  function displayRobloxVersion(platform, recordOrValue) {
    const rawValue = recordOrValue && typeof recordOrValue === 'object'
      ? recordOrValue.version
      : recordOrValue;
    const raw = String(rawValue ?? '').trim();
    if (!DESKTOP_PLATFORMS.has(platform)) return raw;

    // WEAO's current API returns Windows/Mac upload IDs like "version-<hash>".
    // Keep the API value intact for compatibility checks; only remove this prefix in UI text.
    return raw.replace(/^version(?:[-_: ]+|$)/i, '');
  }

  return Object.freeze({ displayRobloxVersion });
});
